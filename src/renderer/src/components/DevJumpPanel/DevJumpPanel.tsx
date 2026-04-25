import { useState } from 'react';
import { ACT_MANIFEST } from '../../../../../dev-jump/engine/act-manifest';
import { ALL_JUMP_TARGETS, type JumpTarget } from '../../../../../dev-jump/engine/types';
import { colors } from '../../theme';

export function DevJumpPanel() {
  const [mode, setMode] = useState<'real' | 'mock'>('real');
  const [busy, setBusy] = useState<JumpTarget | null>(null);
  const [status, setStatus] = useState<string>('');

  const devApi = (window.office as any).devJump as
    | ((req: { target: string; mode: 'real' | 'mock' }) => Promise<{ projectDir: string }>)
    | undefined;

  const enabled = typeof devApi === 'function';

  async function handleJump(target: JumpTarget) {
    if (!devApi) return;
    setBusy(target);
    setStatus(`Seeding ${target} (${mode})...`);
    try {
      const result = await devApi({ target, mode });
      setStatus(`✓ Jumped to ${target} — project: ${result.projectDir}`);
    } catch (err: any) {
      setStatus(`✗ ${err?.message ?? 'Dev jump failed'}`);
    } finally {
      setBusy(null);
    }
  }

  if (!enabled) {
    return (
      <div style={{ padding: 16, color: colors.textMuted, fontSize: 12 }}>
        Dev Jump is unavailable. Launch with <code>OFFICE_DEV=1 npm run dev</code>.
      </div>
    );
  }

  const grouped = {
    imagine: ALL_JUMP_TARGETS.filter((t) => t.startsWith('imagine.')),
    warroom: ALL_JUMP_TARGETS.filter((t) => t.startsWith('warroom.')),
    build: ALL_JUMP_TARGETS.filter((t) => t.startsWith('build.')),
  };

  return (
    <div style={{ padding: 12, flex: 1, overflow: 'auto', fontSize: 12, color: colors.text }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 12 }}>
          <input
            type="radio"
            checked={mode === 'real'}
            onChange={() => setMode('real')}
          /> Real (LLM)
        </label>
        <label>
          <input
            type="radio"
            checked={mode === 'mock'}
            onChange={() => setMode('mock')}
          /> Mock
        </label>
      </div>

      {(Object.entries(grouped) as Array<['imagine' | 'warroom' | 'build', JumpTarget[]]>).map(([phase, targets]) => (
        <div key={phase} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, textTransform: 'capitalize' }}>{phase}</div>
          {targets.map((t) => {
            const act = ACT_MANIFEST[t];
            const label = act.displayName ?? t;
            return (
              <button
                key={t}
                onClick={() => handleJump(t)}
                disabled={busy !== null}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  marginBottom: 4,
                  background: busy === t ? colors.accent + '33' : colors.surface,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 4,
                  cursor: busy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                }}
              >
                Jump: {label}
              </button>
            );
          })}
        </div>
      ))}

      {status && (
        <div style={{ marginTop: 8, padding: 8, background: colors.surfaceDark, borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }}>
          {status}
        </div>
      )}
    </div>
  );
}
