// backend/server.js
// Local git-control backend — runs on http://localhost:3000
// ──────────────────────────────────────────────────────────
// Routes
//   GET  /api/repos              → scan ROOT for git repos
//   GET  /api/branches?repo=…    → list branches for a repo
//   GET  /api/current-branch?repo=… → current branch
//   POST /api/pull               → git pull inside repo
//   POST /api/checkout           → git checkout <branch>

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const { exec } = require('child_process');
const fs       = require('fs');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const ROOT = process.env.ROOT || path.resolve(__dirname, '..');

app.use(cors());
app.use(express.json());

console.log(`🔒 Sandboxed to ROOT: ${ROOT}`);

// ── Security helper ─────────────────────────────────────────────
function safeResolve(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!abs.startsWith(ROOT)) throw new Error('Path traversal attempt blocked');
  return abs;
}

// ── Run a shell command inside a dir ────────────────────────────
function run(cmd, cwd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject({ message: err.message, stderr });
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

// ── Recursively find .git directories ───────────────────────────
function findGitRepos(dir, depth = 0, results = []) {
  if (depth > 4) return results; // don't go too deep
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return results; }

  const hasGit = entries.some(e => e.name === '.git' && e.isDirectory());
  if (hasGit) {
    results.push(dir);
    return results; // don't look inside a repo for nested repos
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    findGitRepos(path.join(dir, e.name), depth + 1, results);
  }
  return results;
}

// ── Routes ───────────────────────────────────────────────────────

// GET /api/repos — scan for git repos
app.get('/api/repos', (req, res) => {
  try {
    const repos = findGitRepos(ROOT).map(abs => ({
      name: path.basename(abs),
      path: path.relative(ROOT, abs),
    }));
    res.json({ repos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/branches?repo=<relative-path>
app.get('/api/branches', async (req, res) => {
  try {
    const repoAbs = safeResolve(req.query.repo || '');
    // Fetch latest remote branches first (so new branches show up)
    try { await run('git fetch --prune', repoAbs); } catch (_) {}
    const { stdout } = await run('git branch -a', repoAbs);
    const branches = stdout
      .split('\n')
      .map(b => b.replace(/^\*?\s+/, '').replace('remotes/origin/', '').trim())
      .filter(b => b && !b.includes('HEAD'));
    const unique = [...new Set(branches)];
    res.json({ branches: unique });
  } catch (e) {
    res.status(500).json({ error: e.message || e });
  }
});

// GET /api/current-branch?repo=<relative-path>
app.get('/api/current-branch', async (req, res) => {
  try {
    const repoAbs = safeResolve(req.query.repo || '');
    const { stdout } = await run('git rev-parse --abbrev-ref HEAD', repoAbs);
    res.json({ branch: stdout });
  } catch (e) {
    res.status(500).json({ error: e.message || e });
  }
});

// POST /api/pull  { repo: "relative/path" }
app.post('/api/pull', async (req, res) => {
  try {
    const repoAbs = safeResolve(req.body.repo || '');
    const result  = await run('git pull', repoAbs);
    res.json({ ok: true, output: result.stdout || result.stderr });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || e, output: e.stderr || '' });
  }
});

// POST /api/checkout  { repo: "relative/path", branch: "main" }
app.post('/api/checkout', async (req, res) => {
  try {
    const repoAbs = safeResolve(req.body.repo || '');
    const branch  = req.body.branch;
    if (!branch) return res.status(400).json({ error: 'branch is required' });
    const result  = await run(`git checkout ${branch}`, repoAbs);
    res.json({ ok: true, output: result.stdout || result.stderr });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || e, output: e.stderr || '' });
  }
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  Git backend running → http://localhost:${PORT}`);
  console.log(`   ROOT = ${ROOT}`);
});
