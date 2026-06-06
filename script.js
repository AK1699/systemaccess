// ---------------------------------------------------------------
// Store file handles so we can re-read files on demand
// ---------------------------------------------------------------
let fileRegistry = []; // [{name, size, handle (FileSystemFileHandle or File)}]

// ---------------------------------------------------------------
// Folder / file picker
// ---------------------------------------------------------------
document.getElementById('pickBtn').addEventListener('click', async () => {
  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      fileRegistry = [];

      async function walk(handle, path) {
        for await (const [name, child] of handle.entries()) {
          const childPath = path ? path + '/' + name : name;
          if (child.kind === 'file') {
            // Store the FileSystemFileHandle – re-fetch the File on click
            fileRegistry.push({ name: childPath, size: 0, handle: child, isHandle: true });
          } else if (child.kind === 'directory') {
            await walk(child, childPath);
          }
        }
      }

      await walk(dirHandle, '');

      // Get sizes in a second pass (lightweight)
      for (const entry of fileRegistry) {
        try {
          const f = await entry.handle.getFile();
          entry.size = f.size;
        } catch (_) {}
      }

      renderFiles(fileRegistry);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        alert('Could not open folder: ' + err.message);
      }
    }
  } else {
    // Fallback – plain <input type="file">
    const input = document.getElementById('folderInput');
    input.click();
    input.onchange = (e) => {
      fileRegistry = Array.from(e.target.files).map(f => ({
        name: f.name,
        size: f.size,
        handle: f,
        isHandle: false,
      }));
      renderFiles(fileRegistry);
    };
  }
});

// ---------------------------------------------------------------
// Render the file list
// ---------------------------------------------------------------
function renderFiles(entries) {
  const preview = document.getElementById('preview');
  preview.innerHTML = '';

  if (!entries.length) {
    preview.textContent = 'No files found.';
    return;
  }

  const ul = document.createElement('ul');
  entries.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.style.cursor = 'pointer';
    li.setAttribute('title', 'Click to preview');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.textContent = entry.name;

    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'file-size';
    sizeSpan.textContent = entry.size ? (entry.size / 1024).toFixed(2) + ' KB' : '—';

    li.appendChild(nameSpan);
    li.appendChild(sizeSpan);
    li.addEventListener('click', () => openModal(entry));
    ul.appendChild(li);
  });

  preview.appendChild(ul);
}

// ---------------------------------------------------------------
// Modal
// ---------------------------------------------------------------
async function openModal(entry) {
  // Tear down any existing modal
  const old = document.getElementById('fileModal');
  if (old) old.remove();

  // Get the actual File object (re-fetch from handle if needed)
  let file;
  try {
    if (entry.isHandle) {
      file = await entry.handle.getFile();
    } else {
      file = entry.handle; // already a File object
    }
  } catch (err) {
    alert('Could not read file: ' + err.message);
    return;
  }

  // ── Build overlay ──────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'fileModal';

  // ── Build card ─────────────────────────────────────────────
  const card = document.createElement('div');
  card.id = 'modalCard';

  // Header
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

  // Body
  const body = document.createElement('div');
  body.id = 'modalBody';
  body.textContent = 'Loading…';

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Click outside → close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // ── Render content ─────────────────────────────────────────

  // IMAGE
  if (file.type && file.type.startsWith('image/')) {
    body.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.cssText = 'max-width:100%;max-height:65vh;border-radius:6px;display:block;margin:0 auto';
    body.appendChild(img);
    return;
  }

  // PDF
  if (file.type === 'application/pdf') {
    body.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = URL.createObjectURL(file);
    iframe.style.cssText = 'width:100%;height:65vh;border:none;border-radius:6px';
    body.appendChild(iframe);
    return;
  }

  // VIDEO
  if (file.type && file.type.startsWith('video/')) {
    body.innerHTML = '';
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.style.cssText = 'max-width:100%;max-height:65vh;display:block;margin:0 auto';
    body.appendChild(video);
    return;
  }

  // AUDIO
  if (file.type && file.type.startsWith('audio/')) {
    body.innerHTML = '';
    const audio = document.createElement('audio');
    audio.src = URL.createObjectURL(file);
    audio.controls = true;
    audio.style.cssText = 'width:100%;margin-top:1rem';
    body.appendChild(audio);
    return;
  }

  // TEXT / CODE / JSON / CSV / MARKDOWN
  const textExt = /\.(txt|md|json|csv|js|mjs|ts|jsx|tsx|html?|css|scss|py|rb|sh|bash|yaml|yml|xml|toml|ini|env|log|gitignore|gitattributes|editorconfig)$/i;
  const isText =
    (file.type && (
      file.type.startsWith('text/') ||
      file.type === 'application/json' ||
      file.type === 'application/javascript'
    )) ||
    textExt.test(file.name) ||
    file.name.startsWith('.');

  if (isText) {
    const reader = new FileReader();
    reader.onload = (e) => {
      body.innerHTML = '';
      const pre = document.createElement('pre');
      pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;text-align:left;margin:0;padding:1rem;background:rgba(255,255,255,0.05);border-radius:6px;font-family:monospace;font-size:0.85rem;line-height:1.6';
      pre.textContent = e.target.result;
      body.appendChild(pre);
    };
    reader.onerror = () => {
      body.textContent = 'Error reading file.';
    };
    reader.readAsText(file);
    return;
  }

  // FALLBACK – metadata only
  body.innerHTML = '';
  const meta = document.createElement('div');
  meta.style.textAlign = 'left';
  meta.innerHTML = `
    <p><strong>Name:</strong> ${file.name}</p>
    <p><strong>Type:</strong> ${file.type || 'unknown'}</p>
    <p><strong>Size:</strong> ${(file.size / 1024).toFixed(2)} KB</p>
    <p style="opacity:.6;margin-top:1rem">Binary or unsupported format – cannot display inline.</p>
  `;
  body.appendChild(meta);
}
