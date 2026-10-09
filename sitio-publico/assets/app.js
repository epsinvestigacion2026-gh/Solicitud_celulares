(() => {
  'use strict';
  const settings = window.APP_CONFIG || {records: [], preview: true, demo: true};
  const records = Array.isArray(settings.records) ? settings.records : [];
  const $ = id => document.getElementById(id);
  const region = $('region'), finca = $('finca'), modulo = $('modulo');
  const peopleSection = $('people-section'), peopleContent = $('people-content');
  const deviceList = $('device-list'), submit = $('submit-btn');
  const formHint = $('form-hint');
  let selected = null;
  let processedSelection = null;

  function addOption(select, label, value) {
    const option = document.createElement('option');
    option.textContent = label;
    option.value = value;
    select.append(option);
  }
  function resetSelect(select, prompt) {
    select.replaceChildren();
    addOption(select, prompt, '');
    select.value = '';
    select.disabled = true;
  }
  function countOf(row) {
    if (row.personas_asignadas === null || row.personas_asignadas === '' || row.personas_asignadas === undefined) return null;
    const n = Number(row.personas_asignadas);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }
  function resetModule() {
    selected = null;
    $('module-details').classList.add('hidden');
    $('empty-state').classList.remove('hidden');
    $('data-alert').classList.add('hidden');
    peopleContent.classList.add('hidden');
    deviceList.replaceChildren();
    $('people-count').textContent = '—';
    $('phone-count').textContent = '—';
    $('step-people').classList.remove('active');
    $('step-review').classList.remove('active');
    formHint.textContent = 'Selecciona una ubicación para comenzar el registro.';
    submit.disabled = true;
  }
  const farmsForRegion = () => [...new Map(records.filter(r => r.region === region.value).map(r => [String(r.c_finca), r])).values()].sort((a,b) => a.finca.localeCompare(b.finca, 'es'));
  function refreshRegions() {
    resetSelect(region, records.length ? 'Seleccionar región' : 'No hay módulos pendientes');
    [...new Set(records.map(r => r.region))].sort((a,b) => a.localeCompare(b,'es')).forEach(v => addOption(region,v,v));
    region.disabled = records.length === 0;
    region.dispatchEvent(new Event('change'));
    if (!records.length) formHint.textContent = 'Todos los módulos tienen solicitudes registradas.';
  }
  function removeProcessed(row) {
    const index = records.indexOf(row);
    if (index !== -1) records.splice(index, 1);
    refreshRegions();
  }

  region.addEventListener('change', () => {
    resetSelect(finca, 'Seleccionar finca');
    resetSelect(modulo, 'Primero selecciona una finca');
    resetModule();
    if (!region.value) { resetSelect(finca, 'Primero selecciona una región'); return; }
    farmsForRegion().forEach(r => addOption(finca, `${r.finca} · ${r.c_finca}`, String(r.c_finca)));
    finca.disabled = false;
  });
  finca.addEventListener('change', () => {
    resetSelect(modulo, finca.value ? 'Seleccionar módulo' : 'Primero selecciona una finca');
    resetModule();
    if (!finca.value) return;
    records.filter(r => r.region === region.value && String(r.c_finca) === finca.value)
      .sort((a,b) => a.codigo_modulo.localeCompare(b.codigo_modulo, 'es'))
      .forEach(r => addOption(modulo, r.codigo_modulo, r.codigo_modulo));
    modulo.disabled = false;
  });
  modulo.addEventListener('change', () => {
    resetModule();
    if (!modulo.value) return;
    selected = records.find(r => r.region === region.value && String(r.c_finca) === finca.value && r.codigo_modulo === modulo.value);
    if (!selected) return;
    $('module-details').classList.remove('hidden');
    $('selected-module').textContent = selected.codigo_modulo;
    $('selected-farm').textContent = `${selected.finca} · ${selected.region} · finca ${selected.c_finca}`;
    $('selected-irrigation').textContent = selected.tipo_riego || 'Sin tipo de riego';
    $('empty-state').classList.add('hidden');
    const count = countOf(selected);
    $('people-count').textContent = count === null ? 'Sin dato' : count;
    $('phone-count').textContent = count === null ? '—' : Math.ceil(count / 2);
    if (count === null || count === 0) {
      $('data-alert').classList.remove('hidden');
      $('data-alert').textContent = count === null
        ? 'Este módulo no tiene un número válido de personas asignadas. Corregir o agregar datos antes de registrar la solicitud.'
        : 'Este módulo tiene 0 personas asignadas. No corresponde registrar celulares para esta ubicación.';
      formHint.textContent = 'Revisa las personas asignadas en la base de datos.';
      return;
    }
    peopleContent.classList.remove('hidden');
    $('step-people').classList.add('active');
    const devices = Math.ceil(count / 2);
    $('allocation-text').textContent = `${count} ${count === 1 ? 'persona asignada' : 'personas asignadas'} · ${devices} ${devices === 1 ? 'celular a solicitar' : 'celulares a solicitar'}${count % 2 ? ' · El último celular corresponde a una sola persona.' : '.'}`;
    for (let device = 0; device < devices; device++) createDevice(device, count);
    formHint.textContent = 'Completa los datos de todos los colaboradores para registrar.';
    updateValidation();
  });

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function createDevice(index, count) {
    const card = element('div', 'device-card');
    const header = element('div', 'device-header');
    header.append(element('strong', '', `Celular ${String(index + 1).padStart(2,'0')}`), element('span', '', index * 2 + 1 === count ? '1 colaborador' : '2 colaboradores'));
    card.append(header);
    const body = element('div', 'device-body');
    for (let offset = 0; offset < 2 && index * 2 + offset < count; offset++) {
      const personIndex = index * 2 + offset;
      const row = element('div', 'person-row');
      row.append(element('span', 'person-number', String(personIndex + 1)));
      for (const [key,label,placeholder] of [['nombre','Nombre del colaborador','Nombre completo'],['codigo','Código del colaborador','Ej. COL-001']]) {
        const field = element('label');
        field.append(element('span','',label));
        const input = element('input','person-input');
        input.type = 'text'; input.placeholder = placeholder; input.required = true;
        input.maxLength = key === 'nombre' ? 120 : 40;
        input.autocomplete = 'off'; input.dataset.person = personIndex; input.dataset.field = key;
        input.setAttribute('aria-label', `${label} ${personIndex + 1}`);
        field.append(input); row.append(field);
      }
      body.append(row);
    }
    card.append(body); deviceList.append(card);
  }
  function updateValidation() {
    const inputs = [...deviceList.querySelectorAll('.person-input')];
    const codes = inputs.filter(x => x.dataset.field === 'codigo').map(x => x.value.trim().toLocaleLowerCase('es'));
    const complete = inputs.length > 0 && inputs.every(x => x.value.trim());
    const unique = new Set(codes).size === codes.length;
    submit.disabled = !(complete && unique);
    $('step-review').classList.toggle('active', !submit.disabled);
    if (!complete) formHint.textContent = 'Completa los datos de todos los colaboradores para registrar.';
    else if (!unique) formHint.textContent = 'Revisa los códigos: hay colaboradores repetidos.';
    else formHint.textContent = 'Todo listo para registrar la solicitud.';
  }
  deviceList.addEventListener('input', updateValidation);
  let toastTimeout;
  function notify(message) { const box=$('toast'); box.textContent=message; box.classList.add('show'); clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>box.classList.remove('show'),4500); }
  submit.addEventListener('click', async () => {
    if (!selected || submit.disabled) return;
    const count = countOf(selected);
    const colaboradores = Array.from({length:count}, (_, i) => ({
      nombre: deviceList.querySelector(`[data-person="${i}"][data-field="nombre"]`).value.trim(),
      codigo: deviceList.querySelector(`[data-person="${i}"][data-field="codigo"]`).value.trim(),
    }));
    const celulares = Array.from({length:Math.ceil(count/2)}, () => ({inventario:''}));
    let recordId = 'VISTA PREVIA';
    if (!settings.preview) {
      submit.disabled = true; submit.querySelector('span').textContent = 'Guardando...';
      try {
        if (settings.supabaseClient) {
  const { data, error } = await settings.supabaseClient.rpc(
    'registrar_solicitud',
    {
      p_region: selected.region,
      p_c_finca: String(selected.c_finca),
      p_codigo_modulo: selected.codigo_modulo,
      p_colaboradores: colaboradores,
      p_celulares: celulares
    }
  );

  if (error) {
    const fallo = new Error(
      error.code === '23505'
        ? 'Este módulo ya tiene una solicitud registrada.'
        : error.message
    );
    fallo.status = error.code === '23505' ? 409 : 500;
    throw fallo;
  }

  recordId = data;
} else {
  const response = await fetch(settings.submitUrl || 'index.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': settings.csrf
    },
    body: JSON.stringify({
      module_key: [
        selected.region,
        selected.c_finca,
        selected.codigo_modulo
      ].join('|'),
      colaboradores,
      celulares
    })
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    const fallo = new Error(result.message || 'No se pudo guardar.');
    fallo.status = response.status;
    throw fallo;
  }

  recordId = result.id;
}
      } catch (error) {
        notify(error.message || 'Error de conexión.');
        if (error.status === 409) removeProcessed(selected);
        else updateValidation();
        return;
      }
      finally { submit.querySelector('span').textContent = 'Registrar solicitud'; }
    }
    processedSelection = selected;
    $('success-text').textContent = `${Math.ceil(count/2)} ${Math.ceil(count/2) === 1 ? 'celular solicitado' : 'celulares solicitados'} para ${count} ${count === 1 ? 'colaborador' : 'colaboradores'} en ${selected.codigo_modulo}. Referencia: ${recordId}.`;
    $('success-modal').classList.remove('hidden'); $('new-entry').focus();
  });
  $('new-entry').addEventListener('click', () => { $('success-modal').classList.add('hidden'); if (processedSelection) removeProcessed(processedSelection); processedSelection = null; if (!region.disabled) region.focus(); });
  $('success-modal').addEventListener('click', e => { if (e.target === $('success-modal')) $('new-entry').click(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('success-modal').classList.contains('hidden')) $('new-entry').click(); });

  refreshRegions();

  $('mode-note').textContent = settings.preview
    ? 'Vista previa interactiva: el registro se simula y no se guarda. Abre index.php mediante un servidor PHP para guardar solicitudes.'
    : settings.supabaseClient
      ? 'Catálogo y solicitudes conectados a Supabase.'
      : settings.demo
        ? 'Datos de ejemplo tomados de las capturas. Los registros se guardan en data/solicitudes.jsonl.'
        : 'Catálogo conectado a la base de datos configurada. Los registros se guardan en data/solicitudes.jsonl.';
})();