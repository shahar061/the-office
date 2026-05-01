const $ = (id) => document.getElementById(id);

const id = new URLSearchParams(location.search).get('id');
if (!id) {
  document.body.innerHTML = '<div class="container">Missing ?id= parameter</div>';
} else {
  loadReport(Number(id));
}

let currentReport = null;

async function loadReport(id) {
  try {
    const res = await fetch(`/api/reports/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = await res.json();
    currentReport = r;
    renderReport(r);
  } catch (err) {
    $('error-box').innerHTML = `<div class="error">Failed to load: ${err.message}</div>`;
  }
}

function renderReport(r) {
  $('title').textContent = `#${r.id} — ${r.title}`;
  $('content').style.display = 'block';
  $('meta').innerHTML = `
    <div><strong>Type:</strong> ${r.type === 'bug' ? '🐛 Bug' : '✨ Feature'}</div>
    <div><strong>App version:</strong> ${escapeHtml(r.appVersion)}</div>
    <div><strong>OS:</strong> ${escapeHtml(r.osPlatform)}</div>
    <div><strong>Language:</strong> ${escapeHtml(r.language)}</div>
    <div><strong>Submitted:</strong> ${new Date(r.submittedAt).toLocaleString()}</div>
    <div><strong>Received:</strong> ${new Date(r.receivedAt).toLocaleString()}</div>
  `;
  $('body').textContent = r.body;
  $('status').value = r.status;
  $('triage-note').value = r.triageNote ?? '';
}

async function save(field) {
  const btnSave = $('save');
  const btnNote = $('save-note');
  btnSave.disabled = btnNote.disabled = true;
  $('save-status').textContent = 'Saving...';
  try {
    const patch = {};
    if (field === 'status' || field === 'all') patch.status = $('status').value;
    if (field === 'triageNote' || field === 'all') patch.triageNote = $('triage-note').value;
    const res = await fetch(`/api/reports/${currentReport.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    $('save-status').textContent = '✓ Saved';
    setTimeout(() => { $('save-status').textContent = ''; }, 2000);
  } catch (err) {
    $('save-status').textContent = `Failed: ${err.message}`;
  } finally {
    btnSave.disabled = btnNote.disabled = false;
  }
}

$('save').addEventListener('click', () => save('status'));
$('save-note').addEventListener('click', () => save('triageNote'));
$('copy').addEventListener('click', copyForClaude);

function formatReport(r) {
  const typeLabel = r.type === 'bug' ? 'Bug' : 'Feature';
  const lines = [
    `# Issue #${r.id} — ${r.title} (${typeLabel})`,
    `- App version: ${r.appVersion}`,
    `- OS: ${r.osPlatform}`,
    `- Language: ${r.language}`,
    `- Submitted: ${new Date(r.submittedAt).toISOString()}`,
    `- Status: ${r.status}`,
    '',
    '## Body',
    r.body,
  ];
  const note = (r.triageNote ?? '').trim();
  if (note) {
    lines.push('', '## Triage note', note);
  }
  return lines.join('\n');
}

async function copyForClaude() {
  if (!currentReport) return;
  const btn = $('copy');
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(formatReport(currentReport));
    btn.textContent = '✓ Copied';
  } catch (err) {
    btn.textContent = `Failed: ${err.message}`;
  }
  setTimeout(() => { btn.textContent = original; }, 2000);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
