import { useState } from 'react';
import { AGENT_COLORS } from '@shared/types';
import type { AgentRole } from '@shared/types';
import { useT, type StringKey } from '../../i18n';
import { colors } from '../../theme';

interface PhaseCard {
  nameKey: StringKey;
  color: string;
  taglineKey: StringKey;
  descriptionKey: StringKey;
  agents: AgentRole[];
  outputKeys: StringKey[];
}

const PHASES: PhaseCard[] = [
  {
    nameKey: 'phase.imagine',
    color: '#f97316',
    taglineKey: 'about.phase.imagine.tagline',
    descriptionKey: 'about.phase.imagine.description',
    agents: ['ceo', 'product-manager', 'market-researcher', 'chief-architect'],
    outputKeys: [
      'about.output.visionBrief',
      'about.output.prd',
      'about.output.marketAnalysis',
      'about.output.systemDesign',
    ],
  },
  {
    nameKey: 'phase.warroom',
    color: '#0ea5e9',
    taglineKey: 'about.phase.warroom.tagline',
    descriptionKey: 'about.phase.warroom.description',
    agents: ['project-manager', 'team-lead', 'devops'],
    outputKeys: [
      'about.output.milestones',
      'about.output.implementationPlan',
      'about.output.taskBreakdown',
    ],
  },
  {
    nameKey: 'phase.build',
    color: '#22c55e',
    taglineKey: 'about.phase.build.tagline',
    descriptionKey: 'about.phase.build.description',
    agents: [
      'agent-organizer', 'backend-engineer', 'frontend-engineer',
      'mobile-developer', 'ui-ux-expert', 'data-engineer',
      'devops', 'automation-developer',
    ],
    outputKeys: [
      'about.output.workingSoftware',
      'about.output.tests',
      'about.output.documentation',
    ],
  },
];

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflowY: 'auto' as const,
    padding: '16px 12px',
    gap: '16px',
  },
  header: {
    textAlign: 'center' as const,
    paddingBottom: '12px',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: colors.text,
  },
  tagline: {
    fontSize: '11px',
    color: colors.textDim,
    marginTop: '4px',
  },
  version: {
    fontSize: '10px',
    color: colors.textDark,
    marginTop: '2px',
  },
  sectionLabel: {
    fontSize: '9px',
    color: colors.textDim,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    fontWeight: 600,
  },
  card: (expanded: boolean, phaseColor: string) => ({
    background: colors.surface,
    border: `1px solid ${expanded ? phaseColor + '4D' : colors.borderLight}`,
    borderRadius: '6px',
    padding: '8px 10px',
    cursor: 'pointer',
  }),
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  phaseNumber: (color: string) => ({
    fontSize: '11px',
    fontWeight: 600,
    color,
  }),
  chevron: {
    fontSize: '11px',
    color: colors.textDim,
    width: '12px',
  },
  dots: {
    display: 'flex',
    gap: '2px',
    marginInlineStart: 'auto',
  },
  dot: (color: string) => ({
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: color,
  }),
  expandedBody: {
    marginTop: '8px',
    fontSize: '11px',
    color: colors.textMuted,
    lineHeight: 1.5,
  },
  outputTags: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap' as const,
    marginTop: '8px',
  },
  outputTag: {
    background: colors.bg,
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '9px',
    color: colors.textDim,
  },
  footer: {
    textAlign: 'center' as const,
    paddingTop: '8px',
    borderTop: `1px solid ${colors.borderLight}`,
  },
  footerText: {
    fontSize: '10px',
    color: colors.textDark,
  },
  footerLink: {
    fontSize: '10px',
    color: colors.accent,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    marginTop: '2px',
  },
} as const;

function PhaseCardComponent({ phase, index }: { phase: PhaseCard; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const t = useT();

  return (
    <div style={styles.card(expanded, phase.color)} onClick={() => setExpanded(!expanded)}>
      <div style={styles.cardHeader}>
        <span style={styles.chevron}>{expanded ? '▼' : '▶'}</span>
        <span style={styles.phaseNumber(phase.color)}>
          {index + 1}. {t(phase.nameKey)}
        </span>
        {!expanded && (
          <span style={{ fontSize: '10px', color: colors.textDark, marginInlineStart: '4px' }}>
            {t(phase.taglineKey)}
          </span>
        )}
        <div style={styles.dots}>
          {phase.agents.map((role) => (
            <div key={role} style={styles.dot(AGENT_COLORS[role])} title={role} />
          ))}
        </div>
      </div>
      {expanded && (
        <>
          <div style={styles.expandedBody}>{t(phase.descriptionKey)}</div>
          <div style={styles.outputTags}>
            {phase.outputKeys.map((k) => (
              <span key={k} style={styles.outputTag}>{t(k)}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AboutPanel() {
  const t = useT();
  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>🏢 {t('about.title')}</div>
        <div style={styles.tagline}>{t('about.tagline')}</div>
        <div style={styles.version}>v{__APP_VERSION__}</div>
      </div>

      <div style={styles.sectionLabel}>{t('about.howItWorks')}</div>

      {PHASES.map((phase, i) => (
        <PhaseCardComponent key={phase.nameKey} phase={phase} index={i} />
      ))}

      <div style={styles.footer}>
        <div style={styles.footerText}>{t('about.footer.powered')}</div>
        <button
          style={styles.footerLink}
          onClick={() => window.office.openExternal('https://github.com/shahar061/office')}
        >
          {t('about.footer.github')}
        </button>
      </div>
    </div>
  );
}
