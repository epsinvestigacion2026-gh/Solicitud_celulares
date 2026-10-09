(async () => {
  const cliente = window.clienteSupabase;
  const aviso = document.getElementById('form-hint');

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
      throw new Error('No se pudo obtener el perfil del usuario.');
    }

    document.querySelector('.signed-in-user').textContent = perfil.nombre;

    document.getElementById('logout-supabase')
      .addEventListener('submit', async (evento) => {
        evento.preventDefault();
        await cliente.auth.signOut({ scope: 'local' });
        window.location.replace('index.html');
      });

    document.querySelectorAll('.admin-nav-link, .admin-mobile-link')
      .forEach((enlace) => {
        enlace.href = 'administracion.html';
        enlace.style.display = perfil.rol === 'admin' ? '' : 'none';
      });

    const modulos = [];
    let inicio = 0;

    while (true) {
      const { data, error } = await cliente
        .rpc('modulos_disponibles')
        .range(inicio, inicio + 499);

      if (error) throw error;

      modulos.push(...data);

      if (data.length < 500) break;
      inicio += 500;
    }

    window.APP_CONFIG = {
      records: modulos,
      preview: false,
      demo: false,
      role: perfil.rol,
      supabaseClient: cliente
    };

    const scriptFormulario = document.createElement('script');
    scriptFormulario.src = 'assets/app.js';
    document.body.appendChild(scriptFormulario);

  } catch (error) {
    console.error(error);
    aviso.textContent = 'No se pudieron cargar los módulos: ' + error.message;
  }
})();
