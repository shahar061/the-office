const $ = (id) => document.getElementById(id);

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
    renderRows(data.reports);
  } catch (err) {
    $('error-box').innerHTML = `<div class="error">Failed to load: ${err.message}</div>`;
    $('rows').innerHTML = '';
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
loadReports();
