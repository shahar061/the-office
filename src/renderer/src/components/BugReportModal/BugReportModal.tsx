import { useEffect, useRef } from 'react';
import { useBugReportStore } from '../../stores/bug-report.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useT } from '../../i18n';
import { colors } from '../../theme';

const TURNSTILE_SITE_KEY = '0x4AAAAAADDMjqVMq5IMW6oP';

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  panel: {
    width: 540,
    maxWidth: '95vw',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 20,
    color: colors.text,
    fontSize: 13,
  },
  title: { fontSize: 16, fontWeight: 600, marginBottom: 16 },
  typeRow: { display: 'flex', gap: 16, marginBottom: 12 },
  input: {
    width: '100%', boxSizing: 'border-box' as const,
    background: colors.bg, border: `1px solid ${colors.border}`,
    color: colors.text, padding: '8px 10px', borderRadius: 4,
    fontSize: 13, fontFamily: 'inherit', marginBottom: 8,
  },
  textarea: {
    width: '100%', boxSizing: 'border-box' as const,
    background: colors.bg, border: `1px solid ${colors.border}`,
    color: colors.text, padding: '8px 10px', borderRadius: 4,
    fontSize: 13, fontFamily: 'inherit', resize: 'vertical' as const,
    minHeight: 120,
  },
  details: { marginTop: 8, color: colors.textMuted, fontSize: 11 },
  detailsBody: {
    marginTop: 6, fontFamily: 'monospace',
    background: colors.bg, padding: 8, borderRadius: 4,
  },
  buttonRow: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  cancelBtn: {
    background: 'transparent', border: `1px solid ${colors.border}`,
    color: colors.textMuted, padding: '8px 14px', borderRadius: 4,
    cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
  },
  submitBtn: (enabled: boolean) => ({
    background: enabled ? colors.accent : colors.surface,
    border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 4,
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.5, fontSize: 13, fontFamily: 'inherit',
  }),
  result: (success: boolean) => ({
    marginTop: 12, padding: 10,
    background: success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    border: `1px solid ${success ? '#22c55e' : '#ef4444'}`,
    borderRadius: 4, fontSize: 12,
  }),
} as const;

export function BugReportModal() {
  const t = useT();
  const isOpen = useBugReportStore((s) => s.isOpen);
  const type = useBugReportStore((s) => s.type);
  const title = useBugReportStore((s) => s.title);
  const body = useBugReportStore((s) => s.body);
  const turnstileToken = useBugReportStore((s) => s.turnstileToken);
  const submitting = useBugReportStore((s) => s.submitting);
  const result = useBugReportStore((s) => s.result);
  const close = useBugReportStore((s) => s.close);
  const setType = useBugReportStore((s) => s.setType);
  const setTitle = useBugReportStore((s) => s.setTitle);
  const setBody = useBugReportStore((s) => s.setBody);
  const setTurnstileToken = useBugReportStore((s) => s.setTurnstileToken);
  const submit = useBugReportStore((s) => s.submit);
  const language = useSettingsStore((s) => s.settings?.language ?? 'en');
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Render Turnstile when modal opens
  useEffect(() => {
    if (!isOpen || result?.ok) return;
    const script = document.querySelector(
      'script[src*="challenges.cloudflare.com"]',
    );
    if (!script) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }

    const checkAndRender = () => {
      const w = window as any;
      if (w.turnstile && turnstileRef.current && !turnstileRef.current.dataset.rendered) {
        w.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(null),
          'error-callback': () => setTurnstileToken(null),
        });
        turnstileRef.current.dataset.rendered = '1';
      }
    };

    const id = setInterval(checkAndRender, 100);
    return () => clearInterval(id);
  }, [isOpen, result, setTurnstileToken]);

  if (!isOpen) return null;

  const titleOk = title.trim().length >= 1 && title.length <= 200;
  const bodyOk = body.trim().length >= 10;
  const canSubmit = titleOk && bodyOk && turnstileToken !== null && !submitting && !result?.ok;

  if (result?.ok) {
    return (
      <div style={styles.backdrop} onClick={close}>
        <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div style={styles.title}>{t('feedback.title')}</div>
          <div style={styles.result(true)}>
            {t('feedback.success', { id: result.id })}
          </div>
          <div style={styles.buttonRow}>
            <button style={styles.cancelBtn} onClick={close}>
              {t('feedback.success.close')}
            </button>
            <button
              style={styles.submitBtn(true)}
              onClick={() => useBugReportStore.getState().reset()}
            >
              {t('feedback.success.another')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.backdrop} onClick={close}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>{t('feedback.title')}</div>

        <div style={styles.typeRow}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="bug-report-type"
              checked={type === 'bug'}
              onChange={() => setType('bug')}
            />
            {t('feedback.type.bug')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="bug-report-type"
              checked={type === 'feature'}
              onChange={() => setType('feature')}
            />
            {t('feedback.type.feature')}
          </label>
        </div>

        <input
          autoFocus
          style={styles.input}
          placeholder={t('feedback.title.placeholder')}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          style={styles.textarea}
          placeholder={t('feedback.body.placeholder')}
          value={body}
          maxLength={8000}
          onChange={(e) => setBody(e.target.value)}
        />

        <details style={styles.details}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
            {t('feedback.attached.summary')}
          </summary>
          <div style={styles.detailsBody}>
            App version: {process.env.npm_package_version ?? 'dev'}<br />
            Platform: {window.navigator.platform}<br />
            Language: {language}
          </div>
        </details>

        <div ref={turnstileRef} style={{ marginTop: 12 }} />

        {result && !result.ok && (
          <div style={styles.result(false)}>{result.message}</div>
        )}

        <div style={styles.buttonRow}>
          <button style={styles.cancelBtn} onClick={close} disabled={submitting}>
            {t('feedback.cancel')}
          </button>
          <button
            style={styles.submitBtn(canSubmit)}
            onClick={submit}
            disabled={!canSubmit}
          >
            {submitting ? t('feedback.submitting') : t('feedback.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
