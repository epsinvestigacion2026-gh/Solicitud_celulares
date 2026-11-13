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

  // Numeración por módulo, igual que el formulario: un pedido parcial sigue
  // desde los celulares y colaboradores ya pedidos en ese módulo, en orden
  // de registro. Las solicitudes archivadas no cuentan.
  function desfasesPorModulo(todas) {
    const porModulo = new Map();

    for (const fila of todas) {
      if (fila.archivada) continue;

      const clave = [fila.region, fila.c_finca, fila.codigo_modulo].join('|');
      if (!porModulo.has(clave)) porModulo.set(clave, []);
      porModulo.get(clave).push(fila);
    }

    const desfases = new Map();

    for (const filas of porModulo.values()) {
      filas.sort((a, b) =>
        (Date.parse(a.fecha_registro) - Date.parse(b.fecha_registro)) ||
        String(a.id).localeCompare(String(b.id))
      );

      let celulares = 0;
      let personas = 0;

      for (const fila of filas) {
        desfases.set(String(fila.id), { celulares, personas });
        celulares += Number(fila.celulares_solicitados || 0);
        personas += Array.isArray(fila.colaboradores)
          ? fila.colaboradores.length
          : 0;
      }
    }

    return desfases;
  }

  boton.addEventListener('click', () => {
    const registros = window.solicitudesParaExportar;

    if (!window.XLSX || !Array.isArray(registros)) {
      alert('Espera a que terminen de cargar las solicitudes.');
      return;
    }

    const desfases = desfasesPorModulo(
      Array.isArray(window.solicitudesTodas)
        ? window.solicitudesTodas
        : registros
    );

    const solicitudes = [[
      'Referencia',
      'Usuario solicitante',
      'Fecha y hora (Guatemala)',
      'Región',
      'Código de finca',
      'Finca',
      'Módulo',
      'Tipo de riego',
      'Personas asignadas',
      'Celulares solicitados'
    ]];

    const colaboradores = [[
      'Referencia de solicitud',
      'Celular en el módulo',
      'Colaborador en el módulo',
      'Nombre del colaborador',
      'Código del colaborador'
    ]];

    const detalle = [[
      'Referencia',
      'Usuario solicitante',
      'Fecha y hora (Guatemala)',
      'Región',
      'Finca',
      'Módulo',
      'Tipo de riego',
      'Celular asignado',
      'Nombre del colaborador',
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

      const desfase = desfases.get(String(registro.id)) ||
        { celulares: 0, personas: 0 };

      personas.forEach((persona, indice) => {
        const numeroCelular = desfase.celulares + Math.floor(indice / 2) + 1;

        const celularAsignado =
          `Celular ${String(numeroCelular).padStart(2, '0')}`;

        colaboradores.push([
          String(registro.id),
          numeroCelular,
          desfase.personas + indice + 1,
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
          celularAsignado,
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
        [38, 30, 27, 24, 19, 28, 24, 24, 20, 22]
      ),
      'Solicitudes'
    );

    window.XLSX.utils.book_append_sheet(
      libro,
      crearHoja(
        colaboradores,
        [38, 23, 26, 48, 26]
      ),
      'Colaboradores'
    );

    window.XLSX.utils.book_append_sheet(
      libro,
      crearHoja(
        detalle,
        [38, 30, 27, 24, 28, 24, 24, 20, 48, 26]
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