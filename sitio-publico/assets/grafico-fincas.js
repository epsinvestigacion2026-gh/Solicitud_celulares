(() => {
  const COLORES = [
    '#247c77',
    '#e3a344',
    '#587eb5',
    '#a16caa',
    '#d97761',
    '#95a3b1',
    '#487d83',
    '#b38956',
    '#786d9c',
    '#639768'
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

    const conteoPorRegion = new Map();

    for (const solicitud of solicitudes) {
      const region = String(solicitud.region || '').trim() || 'Sin región';

      conteoPorRegion.set(
        region,
        (conteoPorRegion.get(region) || 0) + 1
      );
    }

    const regiones = [...conteoPorRegion.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort(
        (a, b) => b.cantidad - a.cantidad ||
          a.nombre.localeCompare(b.nombre, 'es')
      );

    const total = solicitudes.length;
    let acumulado = 0;

    const sectores = regiones.map((region, indice) => {
      const color = COLORES[indice % COLORES.length];
      const desde = (acumulado / total * 100).toFixed(4);

      acumulado += region.cantidad;
      const hasta = (acumulado / total * 100).toFixed(4);

      const elemento = document.createElement('li');
      const muestraColor = document.createElement('span');
      const nombre = document.createElement('span');
      const valor = document.createElement('strong');

      muestraColor.className = 'admin-farm-chart-color';
      muestraColor.style.backgroundColor = color;

      nombre.textContent = region.nombre;
      valor.textContent =
        `${region.cantidad} (${(region.cantidad / total * 100).toFixed(1)} %)`;

      elemento.append(muestraColor, nombre, valor);
      leyenda.appendChild(elemento);

      return `${color} ${desde}% ${hasta}%`;
    });

    grafico.style.background = `conic-gradient(${sectores.join(', ')})`;
    grafico.setAttribute(
      'aria-label',
      `${total} solicitudes distribuidas entre ${regiones.length} regiones`
    );

    resumen.textContent =
      `${total} solicitudes en ${regiones.length} regiones, según los filtros aplicados.`;
  };
})();