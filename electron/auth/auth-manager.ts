import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import type { AuthStatus } from '../../shared/types';

const AUTH_FILE = 'auth.json';

export class AuthManager {
  private dataDir: string;
  private apiKey: string | null = null;
  private cliAuthenticated: boolean = false;
  private cliChecked: boolean = false;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.load();
  }

  /**
   * Check if the Claude Code CLI is installed and authenticated.
   * Runs `claude --version` as a lightweight probe. If the CLI is
   * installed and the user has run `claude login`, the SDK will
   * automatically use those credentials.
   */
  async detectCliAuth(): Promise<boolean> {
    try {
      const version = await this.runClaude(['--version']);
      if (!version) {
        this.cliAuthenticated = false;
        this.cliChecked = true;
        return false;
      }
      // CLI exists — check if authenticated by trying a minimal operation.
      // `claude --version` succeeds even without auth, so we check for
      // the existence of the credentials file.
      const claudeDir = path.join(process.env.HOME || '', '.claude');
      const hasCredentials = fs.existsSync(claudeDir) && (
        fs.existsSync(path.join(claudeDir, 'credentials.json')) ||
        fs.existsSync(path.join(claudeDir, '.credentials'))
      );
      this.cliAuthenticated = hasCredentials;
      this.cliChecked = true;
      return hasCredentials;
    } catch {
      this.cliAuthenticated = false;
      this.cliChecked = true;
      return false;
    }
  }

  getStatus(): AuthStatus {
    // CLI auth takes priority
    if (this.cliAuthenticated) {
      return { connected: true, account: 'Claude Code (CLI)', method: 'cli-auth' };
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
    if (this.cliAuthenticated) return undefined; // CLI handles it
    if (this.apiKey) return { ANTHROPIC_API_KEY: this.apiKey };
    return undefined;
  }

  isAuthenticated(): boolean {
    return this.cliAuthenticated || !!this.apiKey;
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
