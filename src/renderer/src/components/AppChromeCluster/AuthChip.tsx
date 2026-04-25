import { useProjectStore } from '../../stores/project.store';
import { useApiKeyPanelStore } from '../../stores/api-key-panel.store';
import { useT } from '../../i18n';

const styles = {
  chip: (connected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    border: `1px solid ${connected ? '#22c55e' : '#ef4444'}`,
    color: connected ? '#86efac' : '#fca5a5',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    fontFamily: 'inherit',
    cursor: connected ? 'default' : 'pointer',
  }),
  dot: (connected: boolean) => ({
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: connected ? '#22c55e' : '#ef4444',
  }),
} as const;

export function AuthChip() {
  const auth = useProjectStore((s) => s.authStatus);
  const t = useT();
  const openApiKeyPanel = useApiKeyPanelStore((s) => s.open);

  function handleClick() {
    if (!auth.connected) openApiKeyPanel();
  }

  return (
    <button
      style={styles.chip(auth.connected)}
      onClick={handleClick}
      disabled={auth.connected}
      aria-label={!auth.connected ? t('cluster.auth.disconnected.aria') : undefined}
    >
      <span style={styles.dot(auth.connected)} />
      {auth.connected
        ? (auth.method === 'cli-auth'
            ? 'Claude Code (CLI)'
            : (auth.account ?? t('project.picker.connected')))
        : t('project.picker.notConnected')}
    </button>
  );
}
