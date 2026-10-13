(() => {
  const cliente = window.clienteSupabase;
  const formulario = document.getElementById('acceso-formulario');
  const aviso = document.getElementById('acceso-error');
  const boton = document.getElementById('acceso-boton');

  const CLAVE_ACTIVIDAD = 'imsa_ultima_actividad';
  const LIMITE_INACTIVIDAD = 5 * 60 * 1000;
  let inicioEnCurso = false;

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
      localStorage.removeItem(CLAVE_ACTIVIDAD);
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
    inicioEnCurso = true;

    try {
      const { data, error } = await cliente.auth.signInWithPassword({
        email: document.getElementById('acceso-correo').value.trim(),
        password: document.getElementById('acceso-contrasena').value
      });

      if (error) throw error;

      // Inicia el contador de cinco minutos después de un login correcto.
      localStorage.setItem(CLAVE_ACTIVIDAD, String(Date.now()));
      await abrirPaginaDelUsuario(data.user);
    } catch (error) {
      mostrarError(error.message || 'No se pudo iniciar sesión.');
    } finally {
      inicioEnCurso = false;
      boton.disabled = false;
    }
  });

  cliente.auth.getUser().then(async ({ data, error }) => {
    if (error || !data.user || inicioEnCurso) return;

    const ultimaActividad = Number(
      localStorage.getItem(CLAVE_ACTIVIDAD)
    );

    if (!ultimaActividad ||
        Date.now() - ultimaActividad >= LIMITE_INACTIVIDAD) {
      await cliente.auth.signOut({ scope: 'local' });
      localStorage.removeItem(CLAVE_ACTIVIDAD);
      return;
    }

    await abrirPaginaDelUsuario(data.user);
  }).catch((error) => {
    mostrarError(error.message || 'No se pudo comprobar la sesión.');
  });
})();