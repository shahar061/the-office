import { colors } from '../../theme';

interface CelebrationHeaderProps {
  projectName: string;
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    borderBottom: `1px solid ${colors.borderLight}`,
    textAlign: 'center' as const,
    animation: 'completion-fade-in 0.6s ease-out',
  },
  checkCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: `${colors.success}22`,
    border: `2px solid ${colors.success}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  check: {
    color: colors.success,
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: 1,
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: colors.text,
    margin: 0,
    marginBottom: '6px',
  },
  projectName: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.accent,
    margin: 0,
    marginBottom: '4px',
  },
  tagline: {
    fontSize: '12px',
    color: colors.textMuted,
    margin: 0,
  },
} as const;

export function CelebrationHeader({ projectName }: CelebrationHeaderProps) {
  return (
    <div style={styles.root}>
      <style>{`
        @keyframes completion-fade-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={styles.checkCircle}>
        <span style={styles.check}>✓</span>
      </div>
      <h1 style={styles.title}>Build Complete</h1>
      <div style={styles.projectName}>{projectName}</div>
      <div style={styles.tagline}>Your app is ready</div>
    </div>
  );
}
