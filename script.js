document.getElementById('pickBtn').addEventListener('click', async () => {
  // Use File System Access API if available (requires HTTPS, e.g., GitHub Pages)
  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      const files = [];
      // Recursively traverse directories
      async function walk(handle, path = '') {
        for await (const [name, child] of handle.entries()) {
          const childPath = path ? `${path}/${name}` : name;
          if (child.kind === 'file') {
            const file = await child.getFile();
            files.push({ name: childPath, size: file.size });
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
    // Fallback: use hidden file input (multiple files selection)
    const input = document.getElementById('folderInput');
    input.click();
    input.onchange = (e) => {
      const files = Array.from(e.target.files).map(f => ({ name: f.name, size: f.size }));
      renderFiles(files);
    };
  }
});

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
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.textContent = f.name;
    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'file-size';
    sizeSpan.textContent = `${(f.size / 1024).toFixed(2)} KB`;
    li.appendChild(nameSpan);
    li.appendChild(sizeSpan);
    ul.appendChild(li);
  });
  preview.appendChild(ul);
}
