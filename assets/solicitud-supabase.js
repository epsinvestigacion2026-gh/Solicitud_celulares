(async () => {
  const cliente = window.clienteSupabase;
  const aviso = document.getElementById('form-hint');

  async function cargarListado(nombreFuncion) {
    const filas = [];
    let inicio = 0;

    while (true) {
      const { data, error } = await cliente
        .rpc(nombreFuncion)
        .range(inicio, inicio + 499);

      if (error) throw error;

      if (!Array.isArray(data)) {
        throw new Error(
          'La consulta ' + nombreFuncion +
          ' no devolvió una lista válida.'
        );
      }

      filas.push(...data);

      if (data.length < 500) return filas;

      inicio += 500;
    }
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

    if (
      errorPerfil ||
      !perfil ||
      !['admin', 'jefe_produccion'].includes(perfil.rol)
    ) {
      throw new Error('No se pudo obtener un perfil autorizado.');
    }

    document.querySelector('.signed-in-user').textContent =
      perfil.nombre;

    document.getElementById('logout-supabase')
      .addEventListener('submit', async evento => {
        evento.preventDefault();
        localStorage.removeItem('imsa_ultima_actividad');
        await cliente.auth.signOut({ scope: 'local' });
        window.location.replace('index.html');
      });

    document.querySelectorAll('.admin-nav-link, .admin-mobile-link')
      .forEach(enlace => {
        enlace.href = 'administracion.html';
        enlace.style.display =
          perfil.rol === 'admin' ? '' : 'none';
      });

    const [fincas, modulos] = await Promise.all([
      cargarListado('fincas_asignadas'),
      cargarListado('modulos_disponibles')
    ]);

    window.APP_CONFIG = {
      records: modulos,
      farms: fincas,
      preview: false,
      demo: false,
      role: perfil.rol,
      supabaseClient: cliente
    };

    const scriptFormulario = document.createElement('script');

    scriptFormulario.src = 'assets/app.js';

    scriptFormulario.onerror = () => {
      aviso.textContent =
        'No se pudo cargar assets/app.js. Recarga la página.';
    };

    document.body.appendChild(scriptFormulario);
  } catch (error) {
    console.error(error);

    aviso.textContent =
      'No se pudieron cargar las fincas y módulos: ' +
      error.message;
  }
})();