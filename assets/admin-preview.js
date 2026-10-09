// Las vistas abiertas desde el disco usan el servidor local del prototipo.
if (window.location.protocol === 'file:') {
  document.querySelectorAll('a[href="admin.php"]').forEach(link => {
    link.href = 'http://127.0.0.1:8000/admin.php';
  });
}
