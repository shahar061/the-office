import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventForwarder } from '../event-forwarder';
import { SnapshotBuilder } from '../snapshot-builder';
import type { ArchivedRun, MobileMessageV2 } from '../../../shared/types';

describe('EventForwarder', () => {
  let broadcaster: { broadcastToAuthenticated: ReturnType<typeof vi.fn> };
  let snapshots: SnapshotBuilder;
  let forwarder: EventForwarder;

  beforeEach(() => {
    broadcaster = { broadcastToAuthenticated: vi.fn() };
    snapshots = new SnapshotBuilder('Test Desktop');
    forwarder = new EventForwarder(snapshots, broadcaster);
  });

  describe('onArchivedRuns', () => {
    it('applies the state patch to the SnapshotBuilder AND broadcasts the same shape', () => {
      const runs: ArchivedRun[] = [
        { agentRole: 'ceo', runNumber: 1, messages: [], timestamp: 100 },
      ];
      // Seed some chat so resetTail effect is observable
      snapshots.ingestChat([{ id: 'm1', role: 'user', text: 'hi', timestamp: 1 }]);

      forwarder.onArchivedRuns(runs, true);

      expect(snapshots.getSnapshot().archivedRuns).toEqual(runs);
      expect(snapshots.getSnapshot().chatTail).toEqual([]);
      expect(broadcaster.broadcastToAuthenticated).toHaveBeenCalledWith({
        type: 'state',
        v: 2,
        patch: { kind: 'archivedRuns', runs, resetTail: true },
      } satisfies MobileMessageV2);
    });

    it('resetTail:false keeps chatTail intact', () => {
      const runs: ArchivedRun[] = [];
      snapshots.ingestChat([{ id: 'm1', role: 'user', text: 'hi', timestamp: 1 }]);
      forwarder.onArchivedRuns(runs, false);
      expect(snapshots.getSnapshot().chatTail).toHaveLength(1);
    });
  });
});
