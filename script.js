// ---------------------------------------------------------------
// 1️⃣  Folder / file picker
// ---------------------------------------------------------------
document.getElementById('pickBtn').addEventListener('click', async () => {
  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      const files = [];

      async function walk(handle, path = '') {
        for await (const [name, child] of handle.entries()) {
          const childPath = path ? `${path}/${name}` : name;
          if (child.kind === 'file') {
            const file = await child.getFile();
            // store the native File object so we can read it later
            files.push({ name: childPath, size: file.size, fileObj: file });
          } else if (child.kind === 'directory') {
            await walk(child, childPath);
          }
        }
      }

      await walk(dirHandle);
      renderFiles(files);
    } catch (err) {
      console.error(err);
      alert('Directory selection was cancelled or failed.');
    }
  } else {
    // Fallback for browsers without File System Access API
    const input = document.getElementById('folderInput');
    input.click();
    input.onchange = (e) => {
      const files = Array.from(e.target.files).map(f => ({
        name: f.name,
        size: f.size,
        fileObj: f,
      }));
      renderFiles(files);
    };
  }
});

// ---------------------------------------------------------------
// 2️⃣  Render the file list – each row is clickable
// ---------------------------------------------------------------
function renderFiles(files) {
  const preview = document.getElementById('preview');
  preview.innerHTML = '';

  if (files.length === 0) {
    preview.textContent = 'No files found.';
    return;
  }

  const ul = document.createElement('ul');
  files.forEach(f => {
    const li = document.createElement('li');
    li.style.cursor = 'pointer';
    li.title = 'Click to preview';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.textContent = f.name;

    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'file-size';
    sizeSpan.textContent = `${(f.size / 1024).toFixed(2)} KB`;

    li.appendChild(nameSpan);
    li.appendChild(sizeSpan);

    // ← click = open preview modal
    li.addEventListener('click', () => openModal(f.fileObj, f.name));

    ul.appendChild(li);
  });

  preview.appendChild(ul);
}

// ---------------------------------------------------------------
// 3️⃣  Modal – shows the actual file content
// ---------------------------------------------------------------
function openModal(file, displayName) {
  // Remove any existing modal first
  const existing = document.getElementById('fileModal');
  if (existing) existing.remove();

  // ── Build overlay ──────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'fileModal';

  // ── Build card ─────────────────────────────────────────────
  const card = document.createElement('div');
  card.id = 'modalCard';

  // Header
  const header = document.createElement('div');
  header.id = 'modalHeader';

  const title = document.createElement('span');
  title.id = 'modalTitle';
  title.textContent = displayName;

  const closeBtn = document.createElement('button');
  closeBtn.id = 'modalClose';
  closeBtn.textContent = '✖';
  closeBtn.addEventListener('click', () => overlay.remove());

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.id = 'modalBody';
  body.textContent = 'Loading…';

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Close when clicking outside the card
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // ── Load content ───────────────────────────────────────────
  if (!file) {
    body.textContent = 'Cannot read this file.';
    return;
  }

  // IMAGE
  if (file.type && file.type.startsWith('image/')) {
    body.innerHTML = '';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.style.maxWidth = '100%';
    img.style.maxHeight = '70vh';
    img.style.borderRadius = '6px';
    body.appendChild(img);
    return;
  }

  // PDF
  if (file.type === 'application/pdf') {
    body.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = URL.createObjectURL(file);
    iframe.style.width = '100%';
    iframe.style.height = '70vh';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '6px';
    body.appendChild(iframe);
    return;
  }

  // VIDEO
  if (file.type && file.type.startsWith('video/')) {
    body.innerHTML = '';
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.style.maxWidth = '100%';
    video.style.maxHeight = '70vh';
    body.appendChild(video);
    return;
  }

  // TEXT / CODE / JSON / CSV / MARKDOWN etc.
  const textExtensions = /\.(txt|md|json|csv|js|ts|jsx|tsx|html?|css|py|sh|yaml|yml|xml|ini|env|log)$/i;
  const isText = (file.type && (
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    file.type === 'application/javascript'
  )) || textExtensions.test(file.name);

  if (isText) {
    const reader = new FileReader();
    reader.onload = (e) => {
      body.innerHTML = '';
      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-all';
      pre.style.textAlign = 'left';
      pre.style.margin = '0';
      pre.textContent = e.target.result;
      body.appendChild(pre);
    };
    reader.onerror = () => {
      body.textContent = 'Could not read the file.';
    };
    reader.readAsText(file);
    return;
  }

  // FALLBACK – show metadata only
  body.innerHTML = '';
  const info = document.createElement('div');
  info.style.textAlign = 'left';
  info.innerHTML = `
    <p><strong>Name:</strong> ${file.name}</p>
    <p><strong>Type:</strong> ${file.type || 'unknown'}</p>
    <p><strong>Size:</strong> ${(file.size / 1024).toFixed(2)} KB</p>
    <p style="opacity:.6; margin-top:1rem;">Binary or unsupported format – cannot display inline.</p>
  `;
  body.appendChild(info);
}
