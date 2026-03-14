import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../../../src/renderer/src/stores/session.store';
import type { SessionListItem } from '../../../shared/types';

const mockSessions: SessionListItem[] = [
  {
    sessionId: 'ses_1',
    title: 'Building the-office app',
    directory: '/Users/dev/the-office',
    projectName: 'the-office',
    status: 'busy',
    lastUpdated: Date.now(),
  },
  {
    sessionId: 'ses_2',
    title: 'Meshek brainstorm',
    directory: '/Users/dev/meshek-io',
    projectName: 'meshek-io',
    status: 'stale',
    lastUpdated: Date.now() - 600000,
  },
];

describe('SessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('starts with empty sessions', () => {
    expect(useSessionStore.getState().sessions).toEqual([]);
  });

  it('updates sessions on handleSessionListUpdate', () => {
    useSessionStore.getState().handleSessionListUpdate(mockSessions);
    expect(useSessionStore.getState().sessions).toHaveLength(2);
    expect(useSessionStore.getState().sessions[0].sessionId).toBe('ses_1');
  });

  it('replaces sessions on subsequent updates', () => {
    useSessionStore.getState().handleSessionListUpdate(mockSessions);
    useSessionStore.getState().handleSessionListUpdate([mockSessions[0]]);
    expect(useSessionStore.getState().sessions).toHaveLength(1);
  });

  it('resets to empty', () => {
    useSessionStore.getState().handleSessionListUpdate(mockSessions);
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().sessions).toEqual([]);
  });
});
