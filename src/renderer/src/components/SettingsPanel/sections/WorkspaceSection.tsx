import React from 'react';
import { useProjectStore } from '../../../stores/project.store';
import { useT } from '../../../i18n';
import { colors } from '../../../theme';

export function WorkspaceSection() {
  const projectState = useProjectStore((s) => s.projectState);
  const t = useT();

  if (projectState === null) {
    return (
      <div style={{ padding: 24, color: colors.textMuted, fontSize: 13, fontStyle: 'italic' }}>
        {t('settings.workspace.placeholder')}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', color: colors.textMuted, fontSize: '13px', fontStyle: 'italic' }}>
      Workspace settings — coming soon.
      <br />
      <br />
      Planned: default layouts per phase, keyboard shortcuts.
    </div>
  );
}
