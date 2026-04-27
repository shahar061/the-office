import React, { useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/project.store';
import { useT } from '../../i18n';
import { colors } from '../../theme';

// ── Styles ──

const S = {
  apiKeySection: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  row: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    background: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: 6,
    padding: '8px 12px',
    color: '#e5e5e5',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  inputFocused: {
    borderColor: colors.accent,
  },
  btn: (accent = false, disabled = false): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 6,
    border: accent ? 'none' : '1px solid #444',
    background: accent ? colors.accent : 'rgba(255,255,255,0.06)',
    color: disabled ? colors.textDark : accent ? '#fff' : '#e5e5e5',
    fontSize: 13,
    fontWeight: accent ? 600 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 0.15s, opacity 0.15s',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  }),
  errorText: {
    fontSize: 12,
    color: '#f87171',
    marginTop: 4,
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.1)',
    borderTopColor: colors.accent,
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
    flexShrink: 0,
  },
};

function Spinner() {
  return <span style={S.spinner} />;
}

// ── Component ──

export function ApiKeyPanel({ onConnected }: { onConnected: () => void }) {
  const setAuthStatus = useProjectStore((s) => s.setAuthStatus);
  const t = useT();
  const [key, setKey] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.office.connectApiKey(trimmed);
      if (result.success) {
        const status = await window.office.getAuthStatus();
        setAuthStatus(status);
        onConnected();
      } else {
        setError(result.error ?? 'Connection failed');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [key, onConnected, setAuthStatus]);

  return (
    <div style={S.apiKeySection}>
      <div style={S.row}>
        <input
          style={{ ...S.input, ...(inputFocused ? S.inputFocused : {}) }}
          type="password"
          placeholder="sk-ant-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          disabled={loading}
          autoFocus
        />
        <button
          style={S.btn(true, loading || !key.trim())}
          onClick={handleConnect}
          disabled={loading || !key.trim()}
        >
          {loading ? <Spinner /> : t('project.picker.connect')}
        </button>
      </div>
      {error && <div style={S.errorText}>{error}</div>}
      <div style={{ fontSize: 11, color: colors.textDark }}>
        {t('picker.auth.getApiKey')}{' '}
        <span style={{ color: colors.accent }}>console.anthropic.com</span>
      </div>
    </div>
  );
}
