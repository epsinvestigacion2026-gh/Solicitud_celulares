(() => {
  const cliente = window.clienteSupabase;
  const CLAVE_ACTIVIDAD = 'imsa_ultima_actividad';
  const LIMITE = 5 * 60 * 1000;

  let cerrando = false;
  let verificando = false;

  function ocultarPagina() {
    document.documentElement.classList.remove('sesion-verificada');
  }

  function tiempoAgotado() {
    const ultimaActividad = Number(
      localStorage.getItem(CLAVE_ACTIVIDAD)
    );

    return !ultimaActividad ||
      Date.now() - ultimaActividad >= LIMITE;
  }

  async function cerrarSesion() {
    if (cerrando) return;
    cerrando = true;
    ocultarPagina();

    localStorage.removeItem(CLAVE_ACTIVIDAD);

    try {
      await cliente.auth.signOut({ scope: 'local' });
    } finally {
      window.location.replace('index.html');
    }
  }

  async function verificarSesion() {
    ocultarPagina();

    if (cerrando || verificando) return;
    verificando = true;

    try {
      if (tiempoAgotado()) {
        await cerrarSesion();
        return;
      }

      const { data, error } = await cliente.auth.getUser();

      if (error || !data.user || tiempoAgotado()) {
        await cerrarSesion();
        return;
      }

      document.documentElement.classList.add('sesion-verificada');
    } catch (error) {
      await cerrarSesion();
    } finally {
      verificando = false;
    }
  }

  function registrarActividad(evento) {
    if (cerrando) return;

    // Una interacción después de los cinco minutos no reactiva la sesión.
    if (tiempoAgotado()) {
      evento.preventDefault();
      evento.stopImmediatePropagation();
      cerrarSesion();
      return;
    }

    localStorage.setItem(CLAVE_ACTIVIDAD, String(Date.now()));
  }

  ['pointerdown', 'keydown', 'input', 'scroll', 'submit'].forEach((tipo) => {
    document.addEventListener(tipo, registrarActividad, true);
  });

  // Al volver con «Atrás», la página se comprueba de nuevo.
  window.addEventListener('pagehide', ocultarPagina);
  window.addEventListener('pageshow', verificarSesion);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) verificarSesion();
  });

  window.addEventListener('storage', (evento) => {
    if (evento.key === CLAVE_ACTIVIDAD && evento.newValue === null) {
      cerrarSesion();
    }
  });

  cliente.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') {
      ocultarPagina();
      window.location.replace('index.html');
    }
  });

  // También se comprueba aunque el navegador retrase los temporizadores
  // mientras la pestaña está en segundo plano.
  setInterval(() => {
    if (tiempoAgotado()) cerrarSesion();
  }, 5000);

  verificarSesion();
})();