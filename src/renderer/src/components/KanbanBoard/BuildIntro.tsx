import { useState } from 'react';
import { colors } from '../../theme';

interface BuildIntroProps {
  onComplete: () => void;
}

interface IntroPanel {
  title: string;
  body: string;
  icon: string;
}

const PANELS: IntroPanel[] = [
  {
    title: 'The specs are written. The engineers are ready.',
    body: 'The War Room planned every detail. Now your AI engineering team takes over — each agent picks up their assigned tasks and gets to work.',
    icon: '📜',
  },
  {
    title: 'Track every task in real time.',
    body: 'The Kanban Board shows four columns: Queued, Active, In Review, and Done. Tasks move through columns as agents implement, self-review, and complete them.',
    icon: '📋',
  },
  {
    title: 'Agents work in parallel.',
    body: 'Independent tasks run at the same time — backend, frontend, and other agents working simultaneously. Tasks with dependencies wait until their prerequisites are done.',
    icon: '👥',
  },
  {
    title: "If something goes wrong, you decide what happens next.",
    body: 'Resume from where it stopped, restart the entire build, or go back to the War Room to revise the plan. You are always in control.',
    icon: '🎮',
  },
];

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  panel: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '480px',
    width: '90%',
    textAlign: 'center' as const,
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: colors.text,
    marginBottom: '12px',
    lineHeight: '1.3',
  },
  body: {
    fontSize: '14px',
    color: colors.textMuted,
    lineHeight: '1.5',
    marginBottom: '24px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    display: 'flex',
    gap: '6px',
  },
  dot: (active: boolean) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: active ? colors.accent : colors.borderLight,
    transition: 'background 0.2s',
  }),
  button: (primary: boolean) => ({
    padding: '8px 20px',
    border: primary ? 'none' : `1px solid ${colors.border}`,
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    background: primary ? colors.accent : 'transparent',
    color: primary ? '#fff' : colors.textMuted,
    fontFamily: 'inherit',
  }),
} as const;

export function BuildIntro({ onComplete }: BuildIntroProps) {
  const [step, setStep] = useState(0);
  const panel = PANELS[step];
  const isLast = step === PANELS.length - 1;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.icon}>{panel.icon}</div>
        <div style={styles.title}>{panel.title}</div>
        <div style={styles.body}>{panel.body}</div>
        <div style={styles.footer}>
          <div style={styles.dots}>
            {PANELS.map((_, i) => (
              <div key={i} style={styles.dot(i === step)} />
            ))}
          </div>
          <button
            style={styles.button(true)}
            onClick={() => {
              if (isLast) onComplete();
              else setStep(step + 1);
            }}
          >
            {isLast ? "Let's Build" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
