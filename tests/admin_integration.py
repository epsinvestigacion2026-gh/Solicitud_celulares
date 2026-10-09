"""Prueba HTTP del flujo completo en una copia temporal, sin alterar datos reales.

Uso: python tests/admin_integration.py --php /ruta/al/php
Requiere composer install. Solo usa la biblioteca estándar de Python.
"""
import argparse
import http.cookiejar
import io
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--php', default='php')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


class Client:
    def __init__(self, base):
        self.base = base
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))

    def request(self, path, data=None, headers=None):
        request = urllib.request.Request(self.base + path, data=data, headers=headers or {})
        try:
            response = self.opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def form(self, values):
        return self.request('/login.php', urllib.parse.urlencode(values).encode())

    def csrf(self):
        status, _, body = self.request('/login.php')
        assert status == 200
        return re.search(rb'name="csrf" value="([^"]+)"', body)[1].decode()


def workbook(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert archive.testzip() is None
        book = ET.fromstring(archive.read('xl/workbook.xml'))
        assert [s.attrib['name'] for s in book.findall('m:sheets/m:sheet', ns)] == ['Solicitudes', 'Colaboradores', 'Detalle completo']
        shared = ET.fromstring(archive.read('xl/sharedStrings.xml'))
        strings = [''.join(s.itertext()) for s in shared.findall('m:si', ns)]
        sheets = []
        for number in (1, 2, 3):
            sheet = ET.fromstring(archive.read(f'xl/worksheets/sheet{number}.xml'))
            assert not sheet.findall('.//m:f', ns), 'Los datos no deben convertirse en formulas'
            assert sheet.find('m:autoFilter', ns) is not None
            assert sheet.find('m:sheetViews/m:sheetView/m:pane', ns).attrib['state'] == 'frozen'
            cells = {}
            for cell in sheet.findall('.//m:c', ns):
                value = cell.find('m:v', ns)
                if value is not None:
                    cells[cell.attrib['r']] = strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text
            sheets.append(cells)
        return sheets


with tempfile.TemporaryDirectory(prefix='imsa-admin-test-') as temporary:
    app = Path(temporary) / 'app'
    shutil.copytree(root, app, ignore=shutil.ignore_patterns('data', 'tests', '.git', 'config.php'))
    (app / 'data').mkdir()
    shutil.copy2(root / 'data/demo.json', app / 'data/demo.json')
    password = 'Test-Only-Password-2026!'
    env = dict(os.environ, IMSA_ADMIN_PASSWORD=password)
    subprocess.run([args.php, 'scripts/create-admin.php', 'admin'], cwd=app, env=env, check=True, capture_output=True)
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    with (Path(temporary) / 'server.log').open('w') as log:
        server = subprocess.Popen([args.php, '-S', f'127.0.0.1:{port}', 'router.php'], cwd=app,
                                  stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            public = Client(f'http://127.0.0.1:{port}')
            for attempt in range(50):
                try:
                    public.request('/login.php')
                    break
                except urllib.error.URLError:
                    time.sleep(.1)
            assert public.request('/admin.php?action=export')[0] == 403
            assert b'Iniciar sesi' in public.request('/index.php')[2]
            assert public.request('/index.php', b'{}', {'Content-Type': 'application/json'})[0] == 401
            for path in ['/data/admin-users.json', '/%64ata/admin-users.json', '/inc/admin-auth.php', '/vendor/autoload.php', '/scripts/create-admin.php', '/composer.lock', '/.gitignore']:
                assert public.request(path)[0] == 404, path
            token = public.csrf()
            assert public.form({'action': 'login', 'username': 'admin', 'password': password, 'csrf': 'invalid'})[0] == 403
            assert public.form({'action': 'login', 'username': 'admin', 'password': 'wrong', 'csrf': token})[0] == 401
            status, headers, body = public.form({'action': 'login', 'username': 'admin', 'password': password, 'csrf': token})
            assert status == 200 and b'Descargar Excel' in body
            assert headers['Cache-Control'] == 'no-store'
            status, headers, data = public.request('/admin.php?action=export')
            assert status == 200 and headers['Content-Type'].endswith('spreadsheetml.sheet')
            summary, people, combined = workbook(data)
            assert 'A2' not in summary and 'A2' not in people and 'A2' not in combined
            assert [combined[f'{column}1'] for column in 'ABCDEFGHI'] == [
                'Referencia', 'Usuario solicitante', 'Fecha y hora (Guatemala)', 'Región', 'Finca', 'Módulo',
                'Tipo de riego', 'Nombre del colaborador', 'Código del colaborador']
            assert [summary[f'{column}1'] for column in 'ABCDEFGHIJ'] == [
                'Referencia', 'Usuario solicitante', 'Fecha y hora (Guatemala)', 'Región', 'Código de finca',
                'Finca', 'Módulo', 'Tipo de riego', 'Personas asignadas', 'Celulares solicitados']
            print('OK: permisos, CSRF, acceso, archivos privados y Excel vacio')

            submitter = Client(public.base)
            subprocess.run([args.php, 'scripts/create-admin.php', 'jefe_demo', 'jefe_produccion'], cwd=app, env=env, check=True, capture_output=True)
            assert submitter.form({'action': 'login', 'username': 'jefe_demo', 'password': password, 'csrf': submitter.csrf()})[0] == 200
            assert submitter.request('/admin.php?action=export')[0] == 403
            assert b'Descargar Excel' not in submitter.request('/admin.php')[2]
            _, _, page = submitter.request('/index.php')
            assert b'manager-name' not in page and b'manager-code' not in page and b'admin.php' not in page
            config = json.loads(re.search(rb'window.APP_CONFIG = (.*?);</script>', page)[1])
            _, _, stale_admin_page = public.request('/index.php')
            stale_admin_config = json.loads(re.search(rb'window.APP_CONFIG = (.*?);</script>', stale_admin_page)[1])
            expected_people = 0
            expected_phones = 0
            for count in (1, 5, 6):
                module = next(row for row in config['records'] if row['personas_asignadas'] == count
                              and (count != 6 or row['finca'] == 'Santa Elisa'))
                payload = {'module_key': '|'.join(str(module[key]) for key in ('region', 'c_finca', 'codigo_modulo')),
                           'usuario_registro': 'usuario_falso',
                           'jefe_produccion': {'nombre': 'Jefe falso', 'codigo': '000JP'},
                           'colaboradores': [{'nombre': '=1+1' if i == 0 else 'Jos\u00e9 Prueba', 'codigo': f'00{i:03}'} for i in range(count)],
                           'celulares': [{'inventario': ''} for _ in range((count + 1) // 2)]}
                status, _, result = submitter.request('/index.php', json.dumps(payload).encode(),
                                                      {'Content-Type': 'application/json', 'X-CSRF-Token': config['csrf']})
                assert status == 201, result
                before = len((app / 'data/solicitudes.jsonl').read_text(encoding='utf-8').splitlines())
                assert submitter.request('/index.php', json.dumps(payload).encode(),
                                         {'Content-Type': 'application/json', 'X-CSRF-Token': config['csrf']})[0] == 409
                assert public.request('/index.php', json.dumps(payload).encode(),
                                      {'Content-Type': 'application/json', 'X-CSRF-Token': stale_admin_config['csrf']})[0] == 409
                assert len((app / 'data/solicitudes.jsonl').read_text(encoding='utf-8').splitlines()) == before
                _, _, refreshed = submitter.request('/index.php')
                available = json.loads(re.search(rb'window.APP_CONFIG = (.*?);</script>', refreshed)[1])['records']
                assert not any(row['region'] == module['region'] and row['c_finca'] == module['c_finca']
                               and row['codigo_modulo'] == module['codigo_modulo'] for row in available)
                if module['finca'] == 'Santa Elisa':
                    assert not any(row['c_finca'] == module['c_finca'] and row['region'] == module['region']
                                   for row in available), 'La finca sin módulos pendientes debe desaparecer'
                expected_people += count
                expected_phones += (count + 1) // 2
            assert submitter.request('/admin.php?action=export')[0] == 403
            _, _, data = public.request('/admin.php?action=export')
            summary, people, combined = workbook(data)
            assert sum(int(summary[f'I{row}']) for row in range(2, 5)) == expected_people
            assert sum(int(summary[f'J{row}']) for row in range(2, 5)) == expected_phones
            assert len([cell for cell in people if cell.startswith('A')]) - 1 == expected_people
            assert people['D2'] == '=1+1' and people['E2'] == '00000'
            assert people['B7'] == '3', 'Cinco colaboradores requieren tres celulares'
            assert float(summary['C2']) > 45000, 'La fecha debe ser un valor Excel numerico'
            assert all(summary[f'B{row}'] == 'jefe_demo' for row in range(2, 5))
            assert len([cell for cell in combined if re.fullmatch(r'A\d+', cell)]) - 1 == expected_people
            assert all(combined[f'A{row}'] == people[f'A{row}'] for row in range(2, expected_people + 2))
            assert all(combined[f'H{row}'] == people[f'D{row}'] and combined[f'I{row}'] == people[f'E{row}']
                       for row in range(2, expected_people + 2))
            requests_by_id = {summary[f'A{row}']: row for row in range(2, 5)}
            for row in range(2, expected_people + 2):
                source = requests_by_id[combined[f'A{row}']]
                for combined_column, source_column in [('B', 'B'), ('C', 'C'), ('D', 'D'), ('E', 'F'), ('F', 'G'), ('G', 'H')]:
                    assert combined[f'{combined_column}{row}'] == summary[f'{source_column}{source}']
            assert combined['H2'] == '=1+1' and combined['I2'] == '00000'
            assert float(combined['C2']) == float(summary['C2'])
            print('OK: registro publico, cantidades pares/impares, exportacion completa, codigos y texto seguro')

            saved = [json.loads(line) for line in (app / 'data/solicitudes.jsonl').read_text(encoding='utf-8').splitlines()]
            assert all(record['usuario_registro'] == 'jefe_demo' for record in saved)
            assert all('jefe_produccion' not in record for record in saved)
            farm_record = next(record for record in saved if record['finca'] == 'Santa Elisa')
            farm_filter = urllib.parse.urlencode({'finca': farm_record['region'] + '|' + str(farm_record['c_finca'])})
            status, _, panel = public.request('/admin.php?' + farm_filter)
            assert status == 200 and b'1 de 3 solicitudes' in panel
            assert b'admin.php?action=export&amp;finca=' in panel
            _, _, data = public.request('/admin.php?action=export&' + farm_filter)
            farm_summary, farm_people, farm_combined = workbook(data)
            assert farm_summary['A2'] == farm_record['id'] and 'A3' not in farm_summary
            assert len([cell for cell in farm_people if re.fullmatch(r'A\d+', cell)]) == 7
            assert len([cell for cell in farm_combined if re.fullmatch(r'A\d+', cell)]) == 7
            user_filter = urllib.parse.urlencode({'usuario': 'jefe_demo', 'region': farm_record['region']})
            _, _, data = public.request('/admin.php?action=export&' + user_filter)
            assert workbook(data)[0]['A2'] == farm_record['id']
            module_filter = urllib.parse.urlencode({'modulo': '|'.join(str(farm_record[k]) for k in ('region', 'c_finca', 'codigo_modulo'))})
            assert workbook(public.request('/admin.php?action=export&' + module_filter)[2])[0]['A2'] == farm_record['id']
            search_filter = urllib.parse.urlencode({'q': farm_record['id']})
            assert workbook(public.request('/admin.php?action=export&' + search_filter)[2])[0]['A2'] == farm_record['id']
            people_filter = urllib.parse.urlencode({'q': 'josé prueba'})
            assert b'2 de 3 solicitudes' in public.request('/admin.php?' + people_filter)[2]
            assert public.request('/admin.php?desde=2026-02-31')[0] == 400
            assert public.request('/admin.php?desde=2026-10-08&hasta=2026-10-07')[0] == 400
            empty_status, _, empty_panel = public.request('/admin.php?desde=2020-01-01&hasta=2020-12-31')
            assert empty_status == 200 and b'0 de 3 solicitudes' in empty_panel
            assert 'A2' not in workbook(public.request('/admin.php?action=export&desde=2020-01-01&hasta=2020-12-31')[2])[0]
            print('OK: filtros combinados, fechas, indicadores y Excel limitado a los resultados')
            _, _, admin_page = public.request('/index.php')
            admin_config = json.loads(re.search(rb'window.APP_CONFIG = (.*?);</script>', admin_page)[1])
            assert b'admin.php' in admin_page and b'manager-name' not in admin_page
            module = next(row for row in admin_config['records'] if row['personas_asignadas'] == 2)
            admin_payload = {
                'module_key': '|'.join(str(module[key]) for key in ('region', 'c_finca', 'codigo_modulo')),
                'colaboradores': [{'nombre': 'Primera persona', 'codigo': '00001'},
                                  {'nombre': 'Segunda persona', 'codigo': '00002'}],
                'celulares': [{'inventario': ''}],
            }
            status, _, result = public.request('/index.php', json.dumps(admin_payload).encode(),
                                               {'Content-Type': 'application/json', 'X-CSRF-Token': admin_config['csrf']})
            assert status == 201, result
            last = json.loads((app / 'data/solicitudes.jsonl').read_text(encoding='utf-8').splitlines()[-1])
            assert last['usuario_registro'] == 'admin' and 'jefe_produccion' not in last
            _, _, data = public.request('/admin.php?action=export')
            summary, people, combined = workbook(data)
            assert summary['B5'] == 'admin'
            assert combined[f'B{expected_people + 2}'] == 'admin'
            print('OK: ambos roles registran solicitudes y queda guardado el usuario autenticado')

            legacy = dict(last)
            legacy['id'] = 'registro-anterior'
            legacy.pop('usuario_registro')
            legacy['jefe_produccion'] = {'nombre': 'Dato manual antiguo', 'codigo': '999'}
            with (app / 'data/solicitudes.jsonl').open('a', encoding='utf-8') as file:
                file.write(json.dumps(legacy, ensure_ascii=False) + '\n')
            _, _, data = public.request('/admin.php?action=export')
            summary, _, combined = workbook(data)
            assert summary['A6'] == 'registro-anterior' and summary.get('B6', '') == ''
            assert combined[f'A{expected_people + 4}'] == 'registro-anterior'
            assert combined.get(f'B{expected_people + 4}', '') == ''
            print('OK: registros antiguos sin usuario no se atribuyen al dato manual anterior')

            token = public.csrf()
            assert public.form({'action': 'logout', 'csrf': 'invalid'})[0] == 403
            assert public.request('/admin.php?action=export')[0] == 200
            assert public.form({'action': 'logout', 'csrf': token})[0] == 200
            assert public.request('/admin.php?action=export')[0] == 403
            assert public.form({'action': 'login', 'username': 'admin', 'password': password, 'csrf': public.csrf()})[0] == 200
            users_path = app / 'data/admin-users.json'
            users = json.loads(users_path.read_text())
            users['admin']['role'] = 'reader'
            users_path.write_text(json.dumps(users))
            assert public.request('/admin.php?action=export')[0] == 403
            assert public.form({'action': 'login', 'username': 'admin', 'password': password, 'csrf': public.csrf()})[0] == 401
            for attempt in range(4):
                assert public.form({'action': 'login', 'username': 'admin', 'password': 'wrong', 'csrf': public.csrf()})[0] == 401
            fresh = Client(public.base)
            assert fresh.form({'action': 'login', 'username': 'admin', 'password': password, 'csrf': fresh.csrf()})[0] == 429
            print('OK: cierre de sesion, revocacion de rol y bloqueo de intentos aun con cookies nuevas')
        finally:
            server.terminate()
            server.wait(timeout=10)
print('Todas las pruebas pasaron; los registros reales no se modificaron.')
