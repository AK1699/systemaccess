// script.js – File preview + Git repo controls
// ─────────────────────────────────────────────────────────────────
// Change the 'https://...' URL below to your actual Render URL after deploying!
const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3000' 
  : 'https://systemaccess-backend.onrender.com';
// ─────────────────────────────────────────────────────────────────
// 1. Backend health check
// ─────────────────────────────────────────────────────────────────
async function checkServer() {
  const dot = document.getElementById('serverDot');
  const label = document.getElementById('serverLabel');
  try {
    const r = await fetch(`${API}/api/repos`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      dot.className = 'status-dot online';
      label.textContent = 'Backend: online ✓';
      return true;
    }
  } catch (_) { }
  dot.className = 'status-dot offline';
  label.textContent = 'Backend: offline — run: cd backend && npm start';
  return false;
}
checkServer();

// ─────────────────────────────────────────────────────────────────
// 2. File registry (holds FileSystemFileHandle or File objects)
// ─────────────────────────────────────────────────────────────────
let fileRegistry = [];

// ─────────────────────────────────────────────────────────────────
// 3. Folder picker button
// ─────────────────────────────────────────────────────────────────
document.getElementById('pickBtn').addEventListener('click', async () => {
  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      fileRegistry = [];

      async function walk(handle, path) {
        for await (const [name, child] of handle.entries()) {
          const childPath = path ? path + '/' + name : name;
          if (child.kind === 'file') {
            fileRegistry.push({ name: childPath, size: 0, handle: child, isHandle: true });
          } else if (child.kind === 'directory') {
            if (name !== '.git') {
              await walk(child, childPath);
            }
          }
        }
      }

      await walk(dirHandle, '');

      // Get sizes
      for (const entry of fileRegistry) {
        try { const f = await entry.handle.getFile(); entry.size = f.size; } catch (_) { }
      }

      renderFiles(fileRegistry);
      // Always load repos from backend (it knows the real paths)
      loadReposFromBackend(dirHandle.name);
    } catch (err) {
      if (err.name !== 'AbortError') alert('Could not open folder: ' + err.message);
    }
  } else {
    const input = document.getElementById('folderInput');
    input.click();
    input.onchange = (e) => {
      fileRegistry = Array.from(e.target.files).map(f => ({
        name: f.name, size: f.size, handle: f, isHandle: false,
      }));
      renderFiles(fileRegistry);
      
      let folderName = '';
      if (e.target.files.length > 0 && e.target.files[0].webkitRelativePath) {
        folderName = e.target.files[0].webkitRelativePath.split('/')[0];
      }
      loadReposFromBackend(folderName);
    };
  }
});

// ─────────────────────────────────────────────────────────────────
// 4. File list renderer
// ─────────────────────────────────────────────────────────────────
function renderFiles(entries) {
  const preview = document.getElementById('preview');
  preview.innerHTML = '';
  if (!entries.length) { preview.textContent = 'No files found.'; return; }

  const ul = document.createElement('ul');
  entries.forEach(entry => {
    const li = document.createElement('li');
    li.style.cursor = 'pointer';
    li.title = 'Click to preview';

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = entry.name;

    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = entry.size ? (entry.size / 1024).toFixed(2) + ' KB' : '—';

    li.appendChild(name);
    li.appendChild(size);
    li.addEventListener('click', () => openModal(entry));
    ul.appendChild(li);
  });
  preview.appendChild(ul);
}

// ─────────────────────────────────────────────────────────────────
// 5. Load repos from backend (it knows the real filesystem paths)
// ─────────────────────────────────────────────────────────────────
async function loadReposFromBackend(folderName = '') {
  const section = document.getElementById('reposSection');
  const list = document.getElementById('reposList');
  const countEl = document.getElementById('repoCount');
  list.innerHTML = '';

  try {
    const res = await fetch(`${API}/api/repos`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    let repos = data.repos || [];

    // Filter down to only repos that are INSIDE or MATCH the folder the user picked
    if (folderName && folderName !== '.' && folderName !== 'Desktop') {
      repos = repos.filter(r => 
        r.name === folderName || 
        r.path === folderName || 
        r.path.endsWith('/' + folderName) || 
        r.path.startsWith(folderName + '/')
      );
    }

    if (!repos.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    countEl.textContent = `${repos.length} repo${repos.length > 1 ? 's' : ''} found`;

    for (const repo of repos) {
      const card = buildRepoCard(repo.path, true);
      list.appendChild(card);
      loadRepoBranches(repo.path, card);
    }
  } catch (err) {
    section.style.display = 'none';
    console.error('Could not load repos from backend:', err);
  }
}

// Build a repo card DOM element
function buildRepoCard(rel, serverOnline) {
  const card = document.createElement('div');
  card.className = 'repo-card';
  card.dataset.repo = rel;

  const repoName = rel === '.' ? '(root)' : rel.split('/').pop();

  card.innerHTML = `
    <div class="repo-card-header">
      <div class="repo-info">
        <span class="repo-icon">📦</span>
        <div>
          <div class="repo-name">${repoName}</div>
          <div class="repo-path">${rel}</div>
        </div>
      </div>
      <span class="current-branch-badge" id="badge-${sanitizeId(rel)}">…</span>
    </div>

    <div class="repo-card-body">
      <div class="repo-controls">
        <div class="branch-control">
          <label class="control-label">Branch</label>
          <select class="branch-select" id="select-${sanitizeId(rel)}" ${!serverOnline ? 'disabled' : ''}>
            <option>${serverOnline ? 'Loading…' : 'Backend offline'}</option>
          </select>
        </div>
        <button class="pull-btn" id="pull-${sanitizeId(rel)}" ${!serverOnline ? 'disabled' : ''}>
          ⬇ Pull
        </button>
      </div>
      <div class="repo-output" id="output-${sanitizeId(rel)}" style="display:none;"></div>
    </div>
  `;

  // Wire pull button
  card.querySelector(`#pull-${sanitizeId(rel)}`).addEventListener('click', () => doPull(rel));

  // Wire branch select
  card.querySelector(`#select-${sanitizeId(rel)}`).addEventListener('change', (e) => {
    doCheckout(rel, e.target.value);
  });

  return card;
}

function sanitizeId(str) {
  return str.replace(/[^a-zA-Z0-9]/g, '_');
}

// Load branches from backend and populate dropdown
async function loadRepoBranches(rel, card) {
  const select = card.querySelector(`#select-${sanitizeId(rel)}`);
  const badge = card.querySelector(`#badge-${sanitizeId(rel)}`);
  const pullBtn = card.querySelector(`#pull-${sanitizeId(rel)}`);

  try {
    const [branchRes, currentRes] = await Promise.all([
      fetch(`${API}/api/branches?repo=${encodeURIComponent(rel)}`).then(r => r.json()),
      fetch(`${API}/api/current-branch?repo=${encodeURIComponent(rel)}`).then(r => r.json()),
    ]);

    const branches = branchRes.branches || [];
    const current = currentRes.branch || '';

    badge.textContent = current || '?';

    select.innerHTML = '';
    branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b;
      opt.textContent = b;
      if (b === current) opt.selected = true;
      select.appendChild(opt);
    });

    select.disabled = false;
    pullBtn.disabled = false;
  } catch (err) {
    select.innerHTML = `<option>Error loading branches</option>`;
    badge.textContent = '?';
  }
}

// ─────────────────────────────────────────────────────────────────
// 6. Git actions
// ─────────────────────────────────────────────────────────────────
async function doPull(rel) {
  const id = sanitizeId(rel);
  const btn = document.getElementById(`pull-${id}`);
  const output = document.getElementById(`output-${id}`);

  btn.disabled = true;
  btn.textContent = '⏳ Pulling…';
  output.style.display = 'block';
  output.className = 'repo-output loading';
  output.textContent = 'Running git pull…';

  try {
    const res = await fetch(`${API}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: rel }),
    });
    const data = await res.json();
    output.className = data.ok ? 'repo-output success' : 'repo-output error';
    output.textContent = data.output || data.error || 'Done';
  } catch (err) {
    output.className = 'repo-output error';
    output.textContent = 'Backend unreachable: ' + err.message;
  }

  btn.disabled = false;
  btn.textContent = '⬇ Pull';
}

async function doCheckout(rel, branch) {
  const id = sanitizeId(rel);
  const badge = document.getElementById(`badge-${id}`);
  const output = document.getElementById(`output-${id}`);

  output.style.display = 'block';
  output.className = 'repo-output loading';
  output.textContent = `Switching to ${branch}…`;

  try {
    const res = await fetch(`${API}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: rel, branch }),
    });
    const data = await res.json();
    output.className = data.ok ? 'repo-output success' : 'repo-output error';
    output.textContent = data.output || data.error || 'Done';
    if (data.ok) badge.textContent = branch;
  } catch (err) {
    output.className = 'repo-output error';
    output.textContent = 'Backend unreachable: ' + err.message;
  }
}

// ─────────────────────────────────────────────────────────────────
// 7. File preview modal
// ─────────────────────────────────────────────────────────────────
async function openModal(entry) {
  const old = document.getElementById('fileModal');
  if (old) old.remove();

  let file;
  try {
    file = entry.isHandle ? await entry.handle.getFile() : entry.handle;
  } catch (err) {
    alert('Could not read file: ' + err.message);
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'fileModal';

  const card = document.createElement('div');
  card.id = 'modalCard';

  const header = document.createElement('div');
  header.id = 'modalHeader';

  const titleEl = document.createElement('span');
  titleEl.id = 'modalTitle';
  titleEl.textContent = entry.name;

  const closeBtn = document.createElement('button');
  closeBtn.id = 'modalClose';
  closeBtn.textContent = '✖';
  closeBtn.addEventListener('click', () => overlay.remove());

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.id = 'modalBody';
  body.textContent = 'Loading…';

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  // Render by type
  if (file.type && file.type.startsWith('image/')) {
    body.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.cssText = 'max-width:100%;max-height:65vh;border-radius:6px;display:block;margin:0 auto';
    body.appendChild(img);
    return;
  }

  if (file.type === 'application/pdf') {
    body.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = URL.createObjectURL(file);
    iframe.style.cssText = 'width:100%;height:65vh;border:none;border-radius:6px';
    body.appendChild(iframe);
    return;
  }

  if (file.type && file.type.startsWith('video/')) {
    body.innerHTML = '';
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.style.cssText = 'max-width:100%;max-height:65vh;display:block;margin:0 auto';
    body.appendChild(video);
    return;
  }

  if (file.type && file.type.startsWith('audio/')) {
    body.innerHTML = '';
    const audio = document.createElement('audio');
    audio.src = URL.createObjectURL(file);
    audio.controls = true;
    audio.style.cssText = 'width:100%;margin-top:1rem';
    body.appendChild(audio);
    return;
  }

  const textExt = /\.(txt|md|json|csv|js|mjs|ts|jsx|tsx|html?|css|scss|py|rb|sh|bash|yaml|yml|xml|toml|ini|env|log|gitignore|gitattributes|editorconfig)$/i;
  const isText = (file.type && (file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/javascript'))
    || textExt.test(file.name) || file.name.startsWith('.');

  if (isText) {
    const reader = new FileReader();
    reader.onload = (e) => {
      body.innerHTML = '';
      const pre = document.createElement('pre');
      pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;text-align:left;margin:0;padding:1rem;background:rgba(255,255,255,0.05);border-radius:6px;font-family:monospace;font-size:0.85rem;line-height:1.6';
      pre.textContent = e.target.result;
      body.appendChild(pre);
    };
    reader.onerror = () => { body.textContent = 'Error reading file.'; };
    reader.readAsText(file);
    return;
  }

  body.innerHTML = '';
  const meta = document.createElement('div');
  meta.style.textAlign = 'left';
  meta.innerHTML = `
    <p><strong>Name:</strong> ${file.name}</p>
    <p><strong>Type:</strong> ${file.type || 'unknown'}</p>
    <p><strong>Size:</strong> ${(file.size / 1024).toFixed(2)} KB</p>
    <p style="opacity:.6;margin-top:1rem">Binary or unsupported format — cannot display inline.</p>
  `;
  body.appendChild(meta);
}
