import fs from 'fs';
import path from 'path';
import type { Request } from '../../shared/types';

const OFFICE_DIR = '.the-office';
const REQUESTS_FILE = 'requests.json';

export class RequestStore {
  private projectDir: string;
  private requests: Request[] = [];
  private nextId: number = 1;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.load();
    this.recoverStuckRequests();
  }

  private get filePath(): string {
    return path.join(this.projectDir, OFFICE_DIR, REQUESTS_FILE);
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.requests = [];
        return;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.requests = parsed.map((r: Partial<Request>) => ({
          ...r,
          plan: r.plan ?? null,
        })) as Request[];
        // Compute nextId as highest existing number + 1
        for (const r of this.requests) {
          const num = this.parseIdNumber(r.id);
          if (num !== null && num >= this.nextId) {
            this.nextId = num + 1;
          }
        }
      }
    } catch {
      this.requests = [];
    }
  }

  private recoverStuckRequests(): void {
    let changed = false;
    const now = Date.now();
    for (const r of this.requests) {
      if (r.status === 'in_progress' || r.status === 'queued') {
        r.status = 'failed';
        r.error = 'Interrupted by app restart';
        r.completedAt = now;
        changed = true;
      }
    }
    if (changed) {
      this.save();
    }
  }

  private parseIdNumber(id: string): number | null {
    const match = id.match(/^req-(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  private save(): void {
    const dir = path.join(this.projectDir, OFFICE_DIR);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.requests, null, 2), 'utf-8');
  }

  /** Returns all requests, newest first (by createdAt desc). */
  list(): Request[] {
    return [...this.requests].sort((a, b) => b.createdAt - a.createdAt);
  }

  create(description: string): Request {
    const id = `req-${String(this.nextId).padStart(3, '0')}`;
    this.nextId++;
    const request: Request = {
      id,
      title: '',
      description,
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      assignedAgent: null,
      result: null,
      error: null,
      plan: null,
    };
    this.requests.push(request);
    this.save();
    return request;
  }

  update(id: string, patch: Partial<Request>): Request | null {
    const index = this.requests.findIndex(r => r.id === id);
    if (index === -1) return null;
    this.requests[index] = { ...this.requests[index], ...patch };
    this.save();
    return this.requests[index];
  }

  get(id: string): Request | null {
    return this.requests.find(r => r.id === id) ?? null;
  }
}
