(() => {
  const COLORES = [
    '#247c77',
    '#e3a344',
    '#587eb5',
    '#a16caa',
    '#d97761',
    '#95a3b1'
  ];

  window.actualizarGraficoFincas = (solicitudes) => {
    const grafico = document.getElementById('farm-chart-pie');
    const leyenda = document.getElementById('farm-chart-legend');
    const resumen = document.getElementById('farm-chart-summary');

    leyenda.replaceChildren();

    if (solicitudes.length === 0) {
      grafico.style.background = '#e5e7eb';
      grafico.setAttribute('aria-label', 'No hay solicitudes para graficar');
      resumen.textContent = 'No hay solicitudes con los filtros seleccionados.';
      return;
    }

    const grupos = new Map();

    for (const fila of solicitudes) {
      // La clave incluye región y código para distinguir fincas homónimas.
      const clave = `${fila.region}|${fila.c_finca}`;

      if (!grupos.has(clave)) {
        grupos.set(clave, {
          nombre: `${fila.finca} · ${fila.region} (finca ${fila.c_finca})`,
          cantidad: 0
        });
      }

      grupos.get(clave).cantidad += 1;
    }

    const ordenados = [...grupos.values()].sort(
      (a, b) => b.cantidad - a.cantidad ||
        a.nombre.localeCompare(b.nombre, 'es')
    );

    const partes = ordenados.slice(0, 5);
    const cantidadOtras = ordenados.slice(5).reduce(
      (total, grupo) => total + grupo.cantidad, 0
    );

    if (cantidadOtras > 0) {
      partes.push({
        nombre: 'Otras fincas',
        cantidad: cantidadOtras
      });
    }

    const total = solicitudes.length;
    let acumulado = 0;

    const sectores = partes.map((parte, indice) => {
      const desde = (acumulado / total * 100).toFixed(4);
      acumulado += parte.cantidad;
      const hasta = (acumulado / total * 100).toFixed(4);

      const elemento = document.createElement('li');
      const color = document.createElement('span');
      const nombre = document.createElement('span');
      const valor = document.createElement('strong');

      color.className = 'admin-farm-chart-color';
      color.style.backgroundColor = COLORES[indice];

      nombre.textContent = parte.nombre;
      valor.textContent =
        `${parte.cantidad} (${(parte.cantidad / total * 100).toFixed(1)} %)`;

      elemento.append(color, nombre, valor);
      leyenda.appendChild(elemento);

      return `${COLORES[indice]} ${desde}% ${hasta}%`;
    });

    grafico.style.background = `conic-gradient(${sectores.join(', ')})`;
    grafico.setAttribute(
      'aria-label',
      `${total} solicitudes distribuidas entre ${ordenados.length} fincas`
    );

    resumen.textContent =
      `${total} solicitudes en ${ordenados.length} fincas, según los filtros aplicados.`;
  };
})();