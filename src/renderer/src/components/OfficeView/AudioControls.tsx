import { useAudioStore } from '../../stores/audio.store';
import { colors } from '../../theme';

export function AudioControls() {
  const musicMuted = useAudioStore((s) => s.musicMuted);
  const sfxMuted = useAudioStore((s) => s.sfxMuted);
  const toggleMusic = useAudioStore((s) => s.toggleMusic);
  const toggleSfx = useAudioStore((s) => s.toggleSfx);

  return (
    <div style={styles.container}>
      <button
        style={styles.button(musicMuted)}
        onClick={toggleMusic}
        title={musicMuted ? 'Unmute music' : 'Mute music'}
        onMouseEnter={(e) => { e.currentTarget.style.color = colors.text; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = musicMuted ? colors.textDark : colors.textMuted; }}
      >
        {musicMuted ? <span style={styles.strikethrough}>{'\u266A'}</span> : '\u266A'}
      </button>
      <button
        style={styles.button(sfxMuted)}
        onClick={toggleSfx}
        title={sfxMuted ? 'Unmute sound effects' : 'Mute sound effects'}
        onMouseEnter={(e) => { e.currentTarget.style.color = colors.text; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = sfxMuted ? colors.textDark : colors.textMuted; }}
      >
        {sfxMuted ? <span style={styles.strikethrough}>{'\u266B'}</span> : '\u266B'}
      </button>
    </div>
  );
}

const styles = {
  container: {
    position: 'absolute' as const,
    bottom: '12px',
    right: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    zIndex: 5,
  },
  button: (muted: boolean): React.CSSProperties => ({
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.3)',
    border: 'none',
    borderRadius: '4px',
    color: muted ? colors.textDark : colors.textMuted,
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    opacity: muted ? 0.4 : 1,
    transition: 'color 0.15s, opacity 0.15s',
  }),
  strikethrough: {
    textDecoration: 'line-through',
  } as React.CSSProperties,
};
