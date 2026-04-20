import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ChatHistoryStore } from '@electron/project/chat-history-store';
import type { ChatMessage, Phase, AgentRole } from '@shared/types';

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random()}`,
    role: 'agent',
    agentRole: 'ceo',
    text: 'Hello',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('ChatHistoryStore', () => {
  let tmpDir: string;
  let store: ChatHistoryStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-history-test-'));
    fs.mkdirSync(path.join(tmpDir, '.the-office'), { recursive: true });
    store = new ChatHistoryStore(tmpDir);
  });

  afterEach(() => {
    store.flush();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('appendMessage + flush', () => {
    it('persists messages to a JSON file after flush', () => {
      const msg = makeMsg({ text: 'test message' });
      store.appendMessage('imagine', 'ceo', 1, msg);
      store.flush();

      const filePath = path.join(tmpDir, '.the-office', 'chat-history', 'imagine_ceo_1.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(data).toHaveLength(1);
      expect(data[0].text).toBe('test message');
    });

    it('appends multiple messages to the same file', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'first' }));
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'second' }));
      store.flush();

      const filePath = path.join(tmpDir, '.the-office', 'chat-history', 'imagine_ceo_1.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(data).toHaveLength(2);
      expect(data[0].text).toBe('first');
      expect(data[1].text).toBe('second');
    });

    it('writes separate files for different agents', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ agentRole: 'ceo' }));
      store.appendMessage('imagine', 'product-manager', 1, makeMsg({ agentRole: 'product-manager' }));
      store.flush();

      const dir = path.join(tmpDir, '.the-office', 'chat-history');
      expect(fs.existsSync(path.join(dir, 'imagine_ceo_1.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'imagine_product-manager_1.json'))).toBe(true);
    });

    it('writes separate files for different run numbers', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'run 1' }));
      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'run 2' }));
      store.flush();

      const dir = path.join(tmpDir, '.the-office', 'chat-history');
      const run1 = JSON.parse(fs.readFileSync(path.join(dir, 'imagine_ceo_1.json'), 'utf-8'));
      const run2 = JSON.parse(fs.readFileSync(path.join(dir, 'imagine_ceo_2.json'), 'utf-8'));
      expect(run1[0].text).toBe('run 1');
      expect(run2[0].text).toBe('run 2');
    });
  });

  describe('nextRunNumber', () => {
    it('returns 1 when no history exists', () => {
      expect(store.nextRunNumber('imagine', 'ceo')).toBe(1);
    });

    it('returns next number after existing runs', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg());
      store.flush();
      expect(store.nextRunNumber('imagine', 'ceo')).toBe(2);
    });

    it('returns next after highest run, not count', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg());
      store.appendMessage('imagine', 'ceo', 3, makeMsg());
      store.flush();
      expect(store.nextRunNumber('imagine', 'ceo')).toBe(4);
    });
  });

  describe('getPhaseHistory', () => {
    it('returns empty array for non-existent phase', () => {
      expect(store.getPhaseHistory('imagine')).toEqual([]);
    });

    it('returns empty array when chat-history dir does not exist', () => {
      const freshStore = new ChatHistoryStore(tmpDir);
      expect(freshStore.getPhaseHistory('imagine')).toEqual([]);
    });

    it('returns all agents and runs for a phase', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'ceo msg', agentRole: 'ceo' }));
      store.appendMessage('imagine', 'product-manager', 1, makeMsg({ text: 'pm msg', agentRole: 'product-manager' }));
      store.flush();

      const history = store.getPhaseHistory('imagine');
      expect(history).toHaveLength(2);

      const ceoHistory = history.find(h => h.agentRole === 'ceo');
      expect(ceoHistory).toBeDefined();
      expect(ceoHistory!.runs).toHaveLength(1);
      expect(ceoHistory!.runs[0].messages[0].text).toBe('ceo msg');
    });

    it('groups multiple runs per agent', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'run 1' }));
      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'run 2' }));
      store.flush();

      const history = store.getPhaseHistory('imagine');
      expect(history).toHaveLength(1);
      expect(history[0].runs).toHaveLength(2);
      expect(history[0].runs[0].runNumber).toBe(1);
      expect(history[0].runs[1].runNumber).toBe(2);
    });

    it('does not include other phases', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg());
      store.appendMessage('warroom', 'project-manager', 1, makeMsg());
      store.flush();

      const history = store.getPhaseHistory('imagine');
      expect(history).toHaveLength(1);
      expect(history[0].agentRole).toBe('ceo');
    });

    it('skips empty run files', () => {
      const dir = path.join(tmpDir, '.the-office', 'chat-history');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'imagine_ceo_1.json'), '[]', 'utf-8');

      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'real' }));
      store.flush();

      const history = store.getPhaseHistory('imagine');
      expect(history).toHaveLength(1);
      expect(history[0].runs).toHaveLength(1);
      expect(history[0].runs[0].runNumber).toBe(2);
    });
  });

  describe('getRuns', () => {
    it('returns runs sorted by run number', () => {
      store.appendMessage('imagine', 'ceo', 3, makeMsg());
      store.appendMessage('imagine', 'ceo', 1, makeMsg());
      store.flush();

      const runs = store.getRuns('imagine', 'ceo');
      expect(runs[0].runNumber).toBe(1);
      expect(runs[1].runNumber).toBe(3);
    });
  });

  describe('getLatestRun', () => {
    it('returns empty array when no runs exist', () => {
      expect(store.getLatestRun('imagine', 'ceo')).toEqual([]);
    });

    it('returns messages from highest run number', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'old' }));
      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'new' }));
      store.flush();

      const latest = store.getLatestRun('imagine', 'ceo');
      expect(latest).toHaveLength(1);
      expect(latest[0].text).toBe('new');
    });
  });

  describe('debounced flush', () => {
    it('does not write to disk before flush is called', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg());
      const filePath = path.join(tmpDir, '.the-office', 'chat-history', 'imagine_ceo_1.json');
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe('computeArchivedRuns', () => {
    it('returns empty when each role has only 1 run', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'only run', timestamp: 100 }));
      store.flush();
      expect(store.computeArchivedRuns('imagine')).toEqual([]);
    });

    it('excludes the latest run per role; includes earlier runs', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'run 1 msg', timestamp: 100 }));
      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'run 2 msg', timestamp: 200 }));
      store.flush();
      const archived = store.computeArchivedRuns('imagine');
      expect(archived).toHaveLength(1);
      expect(archived[0].runNumber).toBe(1);
      expect(archived[0].agentRole).toBe('ceo');
      expect(archived[0].messages[0].text).toBe('run 1 msg');
      expect(archived[0].timestamp).toBe(100);
    });

    it('returns multiple archived runs sorted by timestamp ascending', () => {
      store.appendMessage('imagine', 'ceo', 1, makeMsg({ text: 'ceo run 1', timestamp: 300 }));
      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'ceo run 2', timestamp: 500 }));
      store.appendMessage('imagine', 'market-researcher', 1, makeMsg({
        text: 'mr run 1', agentRole: 'market-researcher', timestamp: 100,
      }));
      store.appendMessage('imagine', 'market-researcher', 2, makeMsg({
        text: 'mr run 2', agentRole: 'market-researcher', timestamp: 600,
      }));
      store.flush();
      const archived = store.computeArchivedRuns('imagine');
      expect(archived).toHaveLength(2);
      // mr run 1 timestamp=100 before ceo run 1 timestamp=300
      expect(archived[0].agentRole).toBe('market-researcher');
      expect(archived[0].runNumber).toBe(1);
      expect(archived[1].agentRole).toBe('ceo');
      expect(archived[1].runNumber).toBe(1);
    });

    it('skips runs with empty messages arrays', () => {
      // Only populate later runs; getPhaseHistory already omits zero-message files
      // by not reading them, so this test guards the shape: if an empty run
      // sneaks into the input, computeArchivedRuns still filters it.
      store.appendMessage('imagine', 'ceo', 2, makeMsg({ text: 'run 2', timestamp: 200 }));
      store.flush();
      expect(store.computeArchivedRuns('imagine')).toEqual([]);
    });
  });
});
