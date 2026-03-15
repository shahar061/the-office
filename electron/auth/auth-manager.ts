import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import type { AuthStatus } from '../../shared/types';

const AUTH_FILE = 'auth.json';

interface CliAuthInfo {
  loggedIn: boolean;
  email?: string;
  subscriptionType?: string;
}

export class AuthManager {
  private dataDir: string;
  private apiKey: string | null = null;
  private cliAuth: CliAuthInfo | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.load();
  }

  /**
   * Check if the Claude Code CLI is installed and authenticated.
   * Runs `claude auth status` which returns JSON with login state,
   * email, and subscription type.
   */
  async detectCliAuth(): Promise<boolean> {
    try {
      const output = await this.runClaude(['auth', 'status']);
      if (!output) {
        this.cliAuth = null;
        return false;
      }
      const parsed = JSON.parse(output) as CliAuthInfo;
      if (parsed.loggedIn) {
        this.cliAuth = parsed;
        return true;
      }
      this.cliAuth = null;
      return false;
    } catch {
      this.cliAuth = null;
      return false;
    }
  }

  getStatus(): AuthStatus {
    // CLI auth takes priority
    if (this.cliAuth?.loggedIn) {
      const label = this.cliAuth.email
        ? `${this.cliAuth.email}${this.cliAuth.subscriptionType ? ` (${this.cliAuth.subscriptionType})` : ''}`
        : 'Claude Code (CLI)';
      return { connected: true, account: label, method: 'cli-auth' };
    }
    // Fall back to API key
    if (this.apiKey) {
      return { connected: true, account: this.redactKey(this.apiKey), method: 'api-key' };
    }
    return { connected: false };
  }

  /**
   * Returns the env overrides to pass to query(). If using CLI auth,
   * no env override is needed. If using API key, sets ANTHROPIC_API_KEY.
   */
  getAuthEnv(): Record<string, string> | undefined {
    if (this.cliAuth?.loggedIn) return undefined; // CLI handles it
    if (this.apiKey) return { ANTHROPIC_API_KEY: this.apiKey };
    return undefined;
  }

  isAuthenticated(): boolean {
    return (this.cliAuth?.loggedIn ?? false) || !!this.apiKey;
  }

  connectApiKey(key: string): { success: boolean; error?: string } {
    if (!key || !key.trim()) return { success: false, error: 'API key cannot be empty' };
    this.apiKey = key.trim();
    this.save();
    return { success: true };
  }

  disconnect(): void {
    this.apiKey = null;
    // Don't touch CLI auth — that's managed by `claude login/logout`
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

  private runClaude(args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      execFile('claude', args, { timeout: 5000 }, (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim());
      });
    });
  }
}
