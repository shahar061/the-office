import fs from 'fs';
import path from 'path';
import type { AuthStatus } from '../../shared/types';

const AUTH_FILE = 'auth.json';

export class AuthManager {
  private dataDir: string;
  private apiKey: string | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.load();
  }

  getStatus(): AuthStatus {
    if (!this.apiKey) return { connected: false };
    return { connected: true, account: this.redactKey(this.apiKey), method: 'api-key' };
  }

  connectApiKey(key: string): { success: boolean; error?: string } {
    if (!key || !key.trim()) return { success: false, error: 'API key cannot be empty' };
    this.apiKey = key.trim();
    this.save();
    return { success: true };
  }

  disconnect(): void {
    this.apiKey = null;
    const filePath = path.join(this.dataDir, AUTH_FILE);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  getApiKey(): string | null { return this.apiKey; }

  private redactKey(key: string): string {
    if (key.length <= 6) return '***';
    return `${key.slice(0, 3)}...${key.slice(-3)}`;
  }

  private load(): void {
    try {
      const filePath = path.join(this.dataDir, AUTH_FILE);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.apiKey = data.apiKey || null;
      }
    } catch { this.apiKey = null; }
  }

  private save(): void {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(path.join(this.dataDir, AUTH_FILE), JSON.stringify({ apiKey: this.apiKey }), 'utf-8');
  }
}
