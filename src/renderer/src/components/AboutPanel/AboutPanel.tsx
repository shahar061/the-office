import { useState } from 'react';
import { AGENT_COLORS } from '@shared/types';
import type { AgentRole } from '@shared/types';
import { colors } from '../../theme';

interface PhaseCard {
  name: string;
  color: string;
  tagline: string;
  description: string;
  agents: AgentRole[];
  outputs: string[];
}

const PHASES: PhaseCard[] = [
  {
    name: 'Imagine',
    color: '#f97316',
    tagline: 'Discovery & product definition',
    description:
      'The CEO hosts a discovery phase, exploring your idea through collaborative dialogue. The team then produces four key documents: a Vision Brief capturing the core concept, a PRD detailing requirements, a Market Analysis assessing the landscape, and a System Design outlining the technical architecture.',
    agents: ['ceo', 'product-manager', 'market-researcher', 'chief-architect'],
    outputs: ['Vision Brief', 'PRD', 'Market Analysis', 'System Design'],
  },
  {
    name: 'War Room',
    color: '#0ea5e9',
    tagline: 'Planning & architecture',
    description:
      'The Project Manager and Team Lead take the design spec and break it into an actionable implementation plan. Milestones are defined, tasks are decomposed with dependencies and acceptance criteria, and a DevOps engineer plans the environment. The result is a battle-ready plan with clear execution order.',
    agents: ['project-manager', 'team-lead', 'devops'],
    outputs: ['Milestones', 'Implementation Plan', 'Task Breakdown'],
  },
  {
    name: 'Build',
    color: '#22c55e',
    tagline: 'Implementation',
    description:
      'Autonomous subagents execute the plan task-by-task. Each agent works in an isolated worktree, with two-stage code review (spec compliance + quality). The full engineering team — frontend, backend, mobile, data, DevOps — collaborates to build the software, with only critical blockers escalated to you.',
    agents: [
      'agent-organizer', 'backend-engineer', 'frontend-engineer',
      'mobile-developer', 'ui-ux-expert', 'data-engineer',
      'devops', 'automation-developer',
    ],
    outputs: ['Working Software', 'Tests', 'Documentation'],
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

  return (
    <div style={styles.card(expanded, phase.color)} onClick={() => setExpanded(!expanded)}>
      <div style={styles.cardHeader}>
        <span style={styles.chevron}>{expanded ? '▼' : '▶'}</span>
        <span style={styles.phaseNumber(phase.color)}>
          {index + 1}. {phase.name}
        </span>
        {!expanded && (
          <span style={{ fontSize: '10px', color: colors.textDark, marginInlineStart: '4px' }}>
            {phase.tagline}
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
          <div style={styles.expandedBody}>{phase.description}</div>
          <div style={styles.outputTags}>
            {phase.outputs.map((o) => (
              <span key={o} style={styles.outputTag}>{o}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AboutPanel() {
  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>🏢 The Office</div>
        <div style={styles.tagline}>Watch your AI team build software</div>
        <div style={styles.version}>v{__APP_VERSION__}</div>
      </div>

      <div style={styles.sectionLabel}>How It Works</div>

      {PHASES.map((phase, i) => (
        <PhaseCardComponent key={phase.name} phase={phase} index={i} />
      ))}

      <div style={styles.footer}>
        <div style={styles.footerText}>Powered by Claude Code</div>
        <button
          style={styles.footerLink}
          onClick={() => window.office.openExternal('https://github.com/shahar061/office')}
        >
          GitHub →
        </button>
      </div>
    </div>
  );
}
