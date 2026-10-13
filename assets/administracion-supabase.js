(async () => {
  const cliente = window.clienteSupabase;
  const estado = document.getElementById('admin-estado');
  const porId = (id) => document.getElementById(id);
  const claveFinca = (fila) => `${fila.region}|${fila.c_finca}`;
  const claveModulo = (fila) =>
    `${fila.region}|${fila.c_finca}|${fila.codigo_modulo}`;

  const formatoFecha = new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'short',
    timeStyle: 'short'
  });

  const partesFecha = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  function fechaLocal(valor) {
    const partes = Object.fromEntries(
      partesFecha.formatToParts(new Date(valor))
        .map((parte) => [parte.type, parte.value])
    );
    return `${partes.year}-${partes.month}-${partes.day}`;
  }

  function agregarOpcion(select, texto, valor, datos = {}) {
    const opcion = new Option(texto, valor);
    Object.assign(opcion.dataset, datos);
    select.add(opcion);
  }

  try {
    const { data: acceso, error: errorAcceso } =
      await cliente.auth.getUser();

    if (errorAcceso || !acceso.user) {
      window.location.replace('index.html');
      return;
    }

    const { data: perfil, error: errorPerfil } = await cliente
      .from('perfiles')
      .select('nombre, rol')
      .eq('usuario_id', acceso.user.id)
      .single();

    if (errorPerfil || !perfil) {
      throw new Error('No se pudo consultar el perfil.');
    }

    if (perfil.rol !== 'admin') {
      window.location.replace('solicitud.html');
      return;
    }

    porId('admin-usuario').textContent = perfil.nombre;

    porId('admin-salir').addEventListener('click', async () => {
      localStorage.removeItem('imsa_ultima_actividad');
      await cliente.auth.signOut({ scope: 'local' });
      window.location.replace('index.html');
    });

    const solicitudes = [];
    let inicio = 0;

    while (true) {
      const { data, error } = await cliente
        .from('solicitudes')
        .select('*')
        .order('fecha_registro', { ascending: false })
        .order('id', { ascending: false })
        .range(inicio, inicio + 499);

      if (error) throw error;

      solicitudes.push(...data);

      if (data.length < 500) break;
      inicio += 500;
    }

    const region = porId('filter-region');
    const finca = porId('filter-farm');
    const modulo = porId('filter-module');
    const usuario = porId('filter-user');
    const formulario = porId('admin-filtros');

    const regiones = [...new Set(solicitudes.map((fila) => fila.region))]
      .sort((a, b) => a.localeCompare(b, 'es'));

    regiones.forEach((valor) =>
      agregarOpcion(region, valor, valor)
    );

    const fincas = [...new Map(
      solicitudes.map((fila) => [claveFinca(fila), fila])
    ).values()].sort((a, b) => a.finca.localeCompare(b.finca, 'es'));

    fincas.forEach((fila) =>
      agregarOpcion(
        finca,
        `${fila.finca} · ${fila.region} · finca ${fila.c_finca}`,
        claveFinca(fila),
        { region: fila.region }
      )
    );

    const modulos = [...new Map(
      solicitudes.map((fila) => [claveModulo(fila), fila])
    ).values()].sort((a, b) =>
      a.codigo_modulo.localeCompare(b.codigo_modulo, 'es')
    );

    modulos.forEach((fila) =>
      agregarOpcion(
        modulo,
        `${fila.codigo_modulo} · ${fila.finca}`,
        claveModulo(fila),
        { region: fila.region, farm: claveFinca(fila) }
      )
    );

    const usuarios = [...new Set(
      solicitudes.map((fila) => fila.usuario_registro)
    )].sort((a, b) => a.localeCompare(b, 'es'));

    usuarios.forEach((valor) =>
      agregarOpcion(usuario, valor, valor)
    );

    function actualizarOpciones() {
      for (const opcion of finca.options) {
        if (!opcion.value) continue;
        const ocultar =
          Boolean(region.value) && opcion.dataset.region !== region.value;
        opcion.hidden = ocultar;
        opcion.disabled = ocultar;
      }

      for (const opcion of modulo.options) {
        if (!opcion.value) continue;
        const ocultar =
          (Boolean(region.value) &&
            opcion.dataset.region !== region.value) ||
          (Boolean(finca.value) &&
            opcion.dataset.farm !== finca.value);
        opcion.hidden = ocultar;
        opcion.disabled = ocultar;
      }
    }

    function aplicarFiltros() {
      const desde = porId('filter-from').value;
      const hasta = porId('filter-to').value;
      const busqueda = porId('filter-search').value.trim()
        .toLocaleLowerCase('es');

      if (desde && hasta && desde > hasta) {
        estado.textContent =
          'La fecha inicial no puede ser posterior a la fecha final.';
        return;
      }

      const filtradas = solicitudes.filter((fila) => {
        if (region.value && fila.region !== region.value) return false;
        if (finca.value && claveFinca(fila) !== finca.value) return false;
        if (modulo.value && claveModulo(fila) !== modulo.value) return false;
        if (usuario.value &&
            fila.usuario_registro !== usuario.value) return false;

        const fecha = fechaLocal(fila.fecha_registro);
        if (desde && fecha < desde) return false;
        if (hasta && fecha > hasta) return false;

        if (busqueda) {
          const textos = [
            fila.id,
            fila.region,
            fila.finca,
            fila.codigo_modulo,
            fila.usuario_registro
          ];

          for (const persona of fila.colaboradores || []) {
            textos.push(persona.nombre, persona.codigo);
          }

          if (!textos.join(' ').toLocaleLowerCase('es')
            .includes(busqueda)) return false;
        }

        return true;
      });

      window.solicitudesParaExportar = filtradas;
      window.actualizarGraficoFincas(filtradas);
      porId('total-solicitudes').textContent = filtradas.length;
      porId('total-colaboradores').textContent = filtradas.reduce(
        (total, fila) => total + Number(fila.personas_asignadas || 0), 0
      );
      porId('total-celulares').textContent = filtradas.reduce(
        (total, fila) => total + Number(fila.celulares_solicitados || 0), 0
      );

      porId('admin-conteo').textContent =
        `${filtradas.length} de ${solicitudes.length} solicitudes`;

      porId('admin-resumen').textContent =
        `Mostrando hasta 50 de ${filtradas.length} solicitudes.`;

      const lista = porId('admin-lista');
      lista.replaceChildren();

      for (const fila of filtradas.slice(0, 50)) {
        const valores = [
          fila.id,
          fila.usuario_registro,
          formatoFecha.format(new Date(fila.fecha_registro)),
          fila.region,
          fila.finca,
          fila.codigo_modulo,
          fila.personas_asignadas,
          fila.celulares_solicitados
        ];

        const renglon = document.createElement('tr');

        for (const valor of valores) {
          const celda = document.createElement('td');
          celda.textContent = String(valor ?? '');
          renglon.appendChild(celda);
        }

        lista.appendChild(renglon);
      }

      estado.textContent = filtradas.length
        ? 'Solicitudes cargadas correctamente.'
        : 'No hay solicitudes con esos filtros.';
    }

    region.addEventListener('change', () => {
      finca.value = '';
      modulo.value = '';
      actualizarOpciones();
    });

    finca.addEventListener('change', () => {
      modulo.value = '';
      actualizarOpciones();
    });

    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      aplicarFiltros();
    });

    formulario.addEventListener('reset', () => {
      setTimeout(() => {
        actualizarOpciones();
        aplicarFiltros();
      }, 0);
    });

    actualizarOpciones();
    aplicarFiltros();

  } catch (error) {
    console.error(error);
    estado.textContent =
      'No se pudieron cargar las solicitudes: ' + error.message;
  }
})();
