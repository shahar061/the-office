const $ = (id) => document.getElementById(id);

let currentReports = [];

async function loadReports() {
  const status = $('filter-status').value;
  const type = $('filter-type').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('type', type);

  $('error-box').innerHTML = '';
  $('rows').innerHTML = '<tr><td colspan="8" class="empty">Loading...</td></tr>';

  try {
    const res = await fetch(`/api/reports?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    currentReports = data.reports;
    renderRows(data.reports);
  } catch (err) {
    $('error-box').innerHTML = `<div class="error">Failed to load: ${err.message}</div>`;
    $('rows').innerHTML = '';
    currentReports = [];
  }
}

function renderRows(reports) {
  const tbody = $('rows');
  if (reports.length === 0) {
    tbody.innerHTML = '';
    $('empty').style.display = 'block';
    return;
  }
  $('empty').style.display = 'none';

  tbody.innerHTML = reports.map((r) => {
    const dt = new Date(r.receivedAt);
    const dateStr = dt.toLocaleString();
    const typeLabel = r.type === 'bug' ? '🐛 Bug' : '✨ Feature';
    return `
      <tr class="row" data-id="${r.id}">
        <td>#${r.id}</td>
        <td><span class="badge ${r.type}">${typeLabel}</span></td>
        <td>${escapeHtml(r.title)}</td>
        <td>${escapeHtml(r.appVersion)}</td>
        <td>${escapeHtml(r.osPlatform)}</td>
        <td>${escapeHtml(r.language)}</td>
        <td>${dateStr}</td>
        <td><span class="badge status-${r.status}">${r.status}</span></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr.row').forEach((row) => {
    row.addEventListener('click', () => {
      window.location.href = `/detail.html?id=${row.dataset.id}`;
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

$('filter-status').addEventListener('change', loadReports);
$('filter-type').addEventListener('change', loadReports);
$('copy-all').addEventListener('click', copyAllForClaude);
loadReports();

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

async function copyAllForClaude() {
  if (currentReports.length === 0) {
    $('copy-status').textContent = 'No reports to copy';
    setTimeout(() => { $('copy-status').textContent = ''; }, 2000);
    return;
  }
  const text = currentReports.map(formatReport).join('\n\n---\n\n');
  try {
    await navigator.clipboard.writeText(text);
    $('copy-status').textContent = `✓ Copied ${currentReports.length} reports`;
  } catch (err) {
    $('copy-status').textContent = `Failed: ${err.message}`;
  }
  setTimeout(() => { $('copy-status').textContent = ''; }, 2000);
}
