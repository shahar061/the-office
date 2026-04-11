import React from 'react';
import { colors } from '../../../theme';

export function GeneralSection() {
  return (
    <div style={{ padding: '24px', color: colors.textMuted, fontSize: '13px', fontStyle: 'italic' }}>
      General settings — coming soon.
      <br />
      <br />
      Planned: theme, audio, window behavior, telemetry.
    </div>
  );
}
