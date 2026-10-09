(() => {
  const boton = document.getElementById('descargar-excel');

  function fechaGuatemala(valor) {
    const formato = new Intl.DateTimeFormat('es-GT', {
      timeZone: 'America/Guatemala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });

    const partes = Object.fromEntries(
      formato.formatToParts(new Date(valor))
        .map((parte) => [parte.type, parte.value])
    );

    return `${partes.day}/${partes.month}/${partes.year} ` +
      `${partes.hour}:${partes.minute}`;
  }

  function crearHoja(filas, anchos) {
    const hoja = window.XLSX.utils.aoa_to_sheet(filas);

    hoja['!cols'] = anchos.map((ancho) => ({ wch: ancho }));
    hoja['!autofilter'] = { ref: hoja['!ref'] };

    return hoja;
  }

  boton.addEventListener('click', () => {
    const registros = window.solicitudesParaExportar;

    if (!window.XLSX || !Array.isArray(registros)) {
      alert('Espera a que terminen de cargar las solicitudes.');
      return;
    }

    const solicitudes = [[
      'Referencia', 'Usuario solicitante', 'Fecha y hora (Guatemala)',
      'Región', 'Código de finca', 'Finca', 'Módulo',
      'Tipo de riego', 'Personas asignadas', 'Celulares solicitados'
    ]];

    const colaboradores = [[
      'Referencia de solicitud', 'Celular en la solicitud',
      'Colaborador en la solicitud', 'Nombre del colaborador',
      'Código del colaborador'
    ]];

    const detalle = [[
      'Referencia', 'Usuario solicitante',
      'Fecha y hora (Guatemala)', 'Región', 'Finca', 'Módulo',
      'Tipo de riego', 'Nombre del colaborador',
      'Código del colaborador'
    ]];

    for (const registro of registros) {
      const fecha = fechaGuatemala(registro.fecha_registro);

      solicitudes.push([
        String(registro.id),
        String(registro.usuario_registro || ''),
        fecha,
        String(registro.region || ''),
        String(registro.c_finca || ''),
        String(registro.finca || ''),
        String(registro.codigo_modulo || ''),
        String(registro.tipo_riego || ''),
        Number(registro.personas_asignadas),
        Number(registro.celulares_solicitados)
      ]);

      const personas = Array.isArray(registro.colaboradores)
        ? registro.colaboradores
        : [];

      personas.forEach((persona, indice) => {
        colaboradores.push([
          String(registro.id),
          Math.floor(indice / 2) + 1,
          indice + 1,
          String(persona.nombre || ''),
          String(persona.codigo || '')
        ]);

        detalle.push([
          String(registro.id),
          String(registro.usuario_registro || ''),
          fecha,
          String(registro.region || ''),
          String(registro.finca || ''),
          String(registro.codigo_modulo || ''),
          String(registro.tipo_riego || ''),
          String(persona.nombre || ''),
          String(persona.codigo || '')
        ]);
      });
    }

    const libro = window.XLSX.utils.book_new();

    window.XLSX.utils.book_append_sheet(
      libro,
      crearHoja(
        solicitudes,
        [23, 25, 27, 24, 19, 28, 24, 24, 20, 22]
      ),
      'Solicitudes'
    );

    window.XLSX.utils.book_append_sheet(
      libro,
      crearHoja(
        colaboradores,
        [26, 23, 26, 48, 26]
      ),
      'Colaboradores'
    );

    window.XLSX.utils.book_append_sheet(
      libro,
      crearHoja(
        detalle,
        [23, 25, 27, 24, 28, 24, 24, 48, 26]
      ),
      'Detalle completo'
    );

    const nombre =
      `solicitudes_${new Date().toISOString().slice(0, 10)}.xlsx`;

    window.XLSX.writeFile(libro, nombre, {
      bookType: 'xlsx',
      compression: true
    });
  });
})();