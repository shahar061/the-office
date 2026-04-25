// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();

  document.body.innerHTML = `
    <div class="container">
      <select id="filter-status"><option value="open" selected>Open</option></select>
      <select id="filter-type"><option value="">All</option></select>
      <div id="error-box"></div>
      <table><tbody id="rows"></tbody></table>
      <div id="empty"></div>
    </div>
  `;

  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({
      reports: [{
        id: 1,
        type: 'bug',
        title: 'Crash test',
        body: 'desc',
        appVersion: '1.0.0',
        osPlatform: 'darwin',
        language: 'en',
        submittedAt: 100,
        receivedAt: 200,
        status: 'open',
      }],
      total: 1,
    }), { status: 200 }),
  );
});

describe('admin list app.js', () => {
  it('renders one row from a mocked response', async () => {
    await import('../public/app.js');
    await new Promise((r) => setTimeout(r, 50));

    const rowsTbody = document.getElementById('rows')!;
    expect(rowsTbody.querySelectorAll('tr.row').length).toBe(1);
    expect(rowsTbody.textContent).toContain('Crash test');
  });
});
