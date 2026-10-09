(() => {
  const cliente = window.clienteSupabase;
  const formulario = document.getElementById('acceso-formulario');
  const aviso = document.getElementById('acceso-error');
  const boton = document.getElementById('acceso-boton');

  function mostrarError(mensaje) {
    aviso.textContent = mensaje;
    aviso.style.display = '';
  }

  async function abrirPaginaDelUsuario(usuario) {
    const { data: perfil, error } = await cliente
      .from('perfiles')
      .select('rol')
      .eq('usuario_id', usuario.id)
      .single();

    if (error || !perfil ||
        !['admin', 'jefe_produccion'].includes(perfil.rol)) {
      await cliente.auth.signOut({ scope: 'local' });
      throw new Error('La cuenta no tiene un perfil autorizado.');
    }

    window.location.replace(
      perfil.rol === 'admin'
        ? 'administracion.html'
        : 'solicitud.html'
    );
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    aviso.style.display = 'none';
    boton.disabled = true;

    try {
      const { data, error } = await cliente.auth.signInWithPassword({
        email: document.getElementById('acceso-correo').value.trim(),
        password: document.getElementById('acceso-contrasena').value
      });

      if (error) throw error;

      await abrirPaginaDelUsuario(data.user);
    } catch (error) {
      mostrarError(error.message || 'No se pudo iniciar sesión.');
    } finally {
      boton.disabled = false;
    }
  });

  cliente.auth.getUser().then(({ data }) => {
    if (data.user) {
      abrirPaginaDelUsuario(data.user).catch((error) => {
        mostrarError(error.message);
      });
    }
  }).catch(() => {
    // El usuario puede intentar iniciar sesión mediante el formulario.
  });
})();