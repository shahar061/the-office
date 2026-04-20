import type React from 'react';
import { useSessionStore } from '../../shared/stores/session.store';
import { agentDisplayName } from '../renderer/src/utils';
import { toolVerb } from './activityVerb';

export function ActivityFooter(): React.JSX.Element | null {
  const snapshot = useSessionStore((s) => s.snapshot);
  if (!snapshot) return null;

  const active = snapshot.characters.find((c) => c.currentTool);
  if (!active || !active.currentTool) return null;

  const verb = toolVerb(active.currentTool.toolName);
  const target = active.currentTool.target;
  const name = agentDisplayName(active.agentRole);

  return (
    <div className="activity-footer" aria-live="polite">
      <span className="activity-dot" />
      <span className="activity-text">
        {name} is {verb}
        {target ? ` ${target}` : ''}
        {'\u2026'}
      </span>
    </div>
  );
}
