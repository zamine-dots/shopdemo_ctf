async function guard() {
  const res = await fetch('/api/me');
  if (!res.ok) return (location.href = '/login.html');
  const me = await res.json();
  if (me.role !== 'admin') {
    document.getElementById('out').textContent = '403 — admin role required.';
    throw new Error('not admin');
  }
}

async function showTab(name, evt) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  if (evt) evt.target.classList.add('active');
  document.getElementById('fileBrowser').style.display = name === 'files' ? 'block' : 'none';

  const endpoints = {
    users: '/api/admin/users',
    orders: '/api/admin/orders',
    logs: '/api/admin/logs',
    config: '/api/admin/config',
    system: '/api/admin/system-info',
  };

  if (name === 'files') {
    document.getElementById('out').textContent = 'See the report browser below.';
    loadFileList();
    return;
  }

  const res = await fetch(endpoints[name]);
  const data = await res.json();
  document.getElementById('out').textContent = JSON.stringify(data, null, 2);
}

async function loadFileList() {
  const res = await fetch('/api/admin/files');
  const data = await res.json();
  const el = document.getElementById('fileList');
  el.innerHTML = '';
  (data.files || []).forEach(f => {
    const div = document.createElement('div');
    div.className = 'note-card';
    div.textContent = f;
    div.onclick = () => previewFile(f);
    el.appendChild(div);
  });
}

async function previewFile(path) {
  const res = await fetch('/api/admin/files/preview?path=' + encodeURIComponent(path));
  const data = await res.json();
  document.getElementById('fileContent').textContent = res.ok
    ? data.content
    : `Error: ${data.error}`;
}

function logout() {
  fetch('/api/logout', { method: 'POST' }).then(() => (location.href = '/login.html'));
}

guard().then(() => showTab('users'));
