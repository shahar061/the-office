import fs from 'fs';
import path from 'path';
import type { ArchivedRun, Phase, AgentRole, ChatMessage, ChatRun, PhaseHistory } from '../../shared/types';

const CHAT_HISTORY_DIR = 'chat-history';
const OFFICE_DIR = '.the-office';

export class ChatHistoryStore {
  private projectDir: string;
  private buffers: Map<string, ChatMessage[]> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  private get historyDir(): string {
    return path.join(this.projectDir, OFFICE_DIR, CHAT_HISTORY_DIR);
  }

  private fileKey(phase: Phase, agentRole: AgentRole, runNumber: number): string {
    return `${phase}_${agentRole}_${runNumber}`;
  }

  private filePath(phase: Phase, agentRole: AgentRole, runNumber: number): string {
    return path.join(this.historyDir, `${this.fileKey(phase, agentRole, runNumber)}.json`);
  }

  private parseFilename(filename: string): { phase: string; agentRole: string; runNumber: number } | null {
    const base = filename.replace(/\.json$/, '');
    const parts = base.split('_');
    if (parts.length < 3) return null;

    const phase = parts[0];
    const runStr = parts[parts.length - 1];
    const runNumber = parseInt(runStr, 10);
    if (isNaN(runNumber)) return null;

    const agentRole = parts.slice(1, -1).join('_');
    if (!agentRole) return null;

    return { phase, agentRole, runNumber };
  }

  appendMessage(phase: Phase, agentRole: AgentRole, runNumber: number, message: ChatMessage): void {
    const key = this.fileKey(phase, agentRole, runNumber);

    let buffer = this.buffers.get(key);
    if (!buffer) {
      const fp = this.filePath(phase, agentRole, runNumber);
      try {
        if (fs.existsSync(fp)) {
          buffer = JSON.parse(fs.readFileSync(fp, 'utf-8')) as ChatMessage[];
        }
      } catch {
        // Corrupted file — start fresh
      }
      if (!buffer) buffer = [];
      this.buffers.set(key, buffer);
    }

    buffer.push(message);
    this.scheduleDebouncedFlush();
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffers.size === 0) return;

    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }

    for (const [key, messages] of this.buffers) {
      const fp = path.join(this.historyDir, `${key}.json`);
      fs.writeFileSync(fp, JSON.stringify(messages, null, 2), 'utf-8');
    }

    this.buffers.clear();
  }

  private scheduleDebouncedFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 1000);
  }

  nextRunNumber(phase: Phase, agentRole: AgentRole): number {
    const runs = this.getRuns(phase, agentRole);
    if (runs.length === 0) return 1;
    return Math.max(...runs.map(r => r.runNumber)) + 1;
  }

  getRuns(phase: Phase, agentRole: AgentRole): ChatRun[] {
    const runs: ChatRun[] = [];

    if (fs.existsSync(this.historyDir)) {
      const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const parsed = this.parseFilename(file);
        if (!parsed) continue;
        if (parsed.phase !== phase || parsed.agentRole !== agentRole) continue;

        try {
          const messages = JSON.parse(
            fs.readFileSync(path.join(this.historyDir, file), 'utf-8'),
          ) as ChatMessage[];
          if (messages.length === 0) continue;
          runs.push({ runNumber: parsed.runNumber, messages });
        } catch {
          continue;
        }
      }
    }

    for (const [key, messages] of this.buffers) {
      const parts = key.split('_');
      if (parts.length < 3) continue;
      const bufPhase = parts[0];
      const bufRun = parseInt(parts[parts.length - 1], 10);
      const bufAgent = parts.slice(1, -1).join('_');

      if (bufPhase === phase && bufAgent === agentRole) {
        const existingIdx = runs.findIndex(r => r.runNumber === bufRun);
        if (existingIdx !== -1) {
          runs[existingIdx] = { runNumber: bufRun, messages: [...messages] };
        } else if (messages.length > 0) {
          runs.push({ runNumber: bufRun, messages: [...messages] });
        }
      }
    }

    return runs.sort((a, b) => a.runNumber - b.runNumber);
  }

  getLatestRun(phase: Phase, agentRole: AgentRole): ChatMessage[] {
    const runs = this.getRuns(phase, agentRole);
    if (runs.length === 0) return [];
    return runs[runs.length - 1].messages;
  }

  clearPhaseHistory(phase: Phase): void {
    // Flush pending buffers first so nothing lingers in memory
    this.flush();

    // Delete disk files for this phase
    if (fs.existsSync(this.historyDir)) {
      const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const parsed = this.parseFilename(file);
        if (parsed && parsed.phase === phase) {
          fs.unlinkSync(path.join(this.historyDir, file));
        }
      }
    }

    // Clear any in-memory buffers for this phase
    for (const key of this.buffers.keys()) {
      if (key.startsWith(`${phase}_`)) {
        this.buffers.delete(key);
      }
    }
  }

  getPhaseHistory(phase: Phase): PhaseHistory[] {
    const agentMap = new Map<string, ChatRun[]>();

    if (fs.existsSync(this.historyDir)) {
      const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const parsed = this.parseFilename(file);
        if (!parsed || parsed.phase !== phase) continue;

        try {
          const messages = JSON.parse(
            fs.readFileSync(path.join(this.historyDir, file), 'utf-8'),
          ) as ChatMessage[];
          if (messages.length === 0) continue;

          if (!agentMap.has(parsed.agentRole)) {
            agentMap.set(parsed.agentRole, []);
          }
          agentMap.get(parsed.agentRole)!.push({
            runNumber: parsed.runNumber,
            messages,
          });
        } catch {
          continue;
        }
      }
    }

    for (const [key, messages] of this.buffers) {
      const parts = key.split('_');
      if (parts.length < 3) continue;
      const bufPhase = parts[0];
      if (bufPhase !== phase) continue;
      if (messages.length === 0) continue;

      const bufRun = parseInt(parts[parts.length - 1], 10);
      const bufAgent = parts.slice(1, -1).join('_');

      if (!agentMap.has(bufAgent)) {
        agentMap.set(bufAgent, []);
      }
      const runs = agentMap.get(bufAgent)!;
      const existingIdx = runs.findIndex(r => r.runNumber === bufRun);
      if (existingIdx !== -1) {
        runs[existingIdx] = { runNumber: bufRun, messages: [...messages] };
      } else {
        runs.push({ runNumber: bufRun, messages: [...messages] });
      }
    }

    const result: PhaseHistory[] = [];
    for (const [agentRole, runs] of agentMap) {
      runs.sort((a, b) => a.runNumber - b.runNumber);
      result.push({ agentRole: agentRole as AgentRole, runs });
    }

    result.sort((a, b) => {
      const aFirst = a.runs[a.runs.length - 1]?.messages[0]?.timestamp ?? 0;
      const bFirst = b.runs[b.runs.length - 1]?.messages[0]?.timestamp ?? 0;
      return aFirst - bFirst;
    });

    return result;
  }

  /**
   * Compute archived-run metadata for a phase. Excludes the latest run per
   * agent role — those messages are the live content in the snapshot's
   * chatTail. Returns sorted ascending by first-message timestamp.
   */
  computeArchivedRuns(phase: Phase): ArchivedRun[] {
    const history = this.getPhaseHistory(phase);
    const archived: ArchivedRun[] = [];
    for (const entry of history) {
      if (entry.runs.length <= 1) continue;
      for (let i = 0; i < entry.runs.length - 1; i++) {
        const run = entry.runs[i];
        if (run.messages.length === 0) continue;
        archived.push({
          agentRole: entry.agentRole,
          runNumber: run.runNumber,
          messages: run.messages,
          timestamp: run.messages[0].timestamp,
        });
      }
    }
    archived.sort((a, b) => a.timestamp - b.timestamp);
    return archived;
  }
}
