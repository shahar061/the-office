// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkspaceSection } from '../../src/renderer/src/components/SettingsPanel/sections/WorkspaceSection';
import { useProjectStore } from '../../src/renderer/src/stores/project.store';

beforeEach(() => {
  useProjectStore.setState({ projectState: null } as any);
});

describe('WorkspaceSection placeholder', () => {
  it('shows placeholder when projectState is null', () => {
    render(<WorkspaceSection />);
    expect(screen.queryByText(/Open a project/)).not.toBeNull();
  });

  it('shows the regular content when projectState exists', () => {
    useProjectStore.setState({
      projectState: { name: 'Test', path: '/tmp/x', currentPhase: 'idle', completedPhases: [] },
    } as any);
    render(<WorkspaceSection />);
    expect(screen.queryByText(/Open a project/)).toBeNull();
    expect(document.body.textContent?.length).toBeGreaterThan(0);
  });
});
