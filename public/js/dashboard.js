// ShopDemo dashboard controller.
// Handles profile display, note listing, and profile updates.
//
// API surface used here:
//   GET   /api/me            -> current profile
//   PATCH /api/me             -> update profile fields (displayName only, from this UI)
//   GET   /api/notes          -> list of note ids/titles owned by the caller
//   GET   /api/notes/:id      -> full note body

async function loadMe() {
  const res = await fetch('/api/me');
  if (!res.ok) {
    location.href = '/login.html';
    return;
  }
  const me = await res.json();
  const badge = me.role === 'admin' ? ' <span class="badge admin">admin</span> <a href="/admin.html">Admin panel</a>' : '';
  document.getElementById('who').innerHTML = `Signed in as <strong>${me.username}</strong>${badge}`;
  document.getElementById('dn').value = me.displayName || '';
}

async function loadNotes() {
  const res = await fetch('/api/notes');
  if (!res.ok) return;
  const notes = await res.json();
  const container = document.getElementById('notes');
  container.innerHTML = '';
  notes.forEach(n => {
    const div = document.createElement('div');
    div.className = 'note-card';
    div.textContent = n.title;
    div.onclick = () => openNote(n.id);
    container.appendChild(div);
  });
  if (notes.length === 0) {
    container.innerHTML = '<p class="muted">No notes yet.</p>';
  }
}

async function openNote(id) {
  const res = await fetch(`/api/notes/${id}`);
  const data = await res.json();
  document.getElementById('noteView').style.display = 'block';
  document.getElementById('noteBody').textContent = res.ok
    ? `${data.title}\n\n${data.body}`
    : `Error: ${data.error}`;
}

async function saveProfile() {
  const displayName = document.getElementById('dn').value;
  // This UI only ever sends displayName -- but the underlying endpoint
  // accepts whatever JSON body it's given. Inspect the request in
  // DevTools / Burp if that sounds interesting.
  const res = await fetch('/api/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  const data = await res.json();
  const el = document.getElementById('pmsg');
  el.className = res.ok ? 'msg success' : 'msg error';
  el.textContent = res.ok ? 'Saved.' : (data.error || 'Error saving profile');
  if (data.flag) {
    el.textContent += ` (${data.flag})`;
  }
}

loadMe();
loadNotes();

function logout() {
  fetch('/api/logout', { method: 'POST' }).then(() => (location.href = '/login.html'));
}
