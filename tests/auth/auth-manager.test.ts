import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AuthManager } from '../../electron/auth/auth-manager';

describe('AuthManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-manager-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Initial state ──

  it('starts disconnected when no auth file exists', () => {
    const manager = new AuthManager(tmpDir);
    const status = manager.getStatus();
    expect(status.connected).toBe(false);
    expect(status.account).toBeUndefined();
    expect(status.method).toBeUndefined();
  });

  it('getApiKey returns null when disconnected', () => {
    const manager = new AuthManager(tmpDir);
    expect(manager.getApiKey()).toBeNull();
  });

  it('isAuthenticated returns false when disconnected', () => {
    const manager = new AuthManager(tmpDir);
    expect(manager.isAuthenticated()).toBe(false);
  });

  // ── API key auth ──

  it('connects with a valid API key', () => {
    const manager = new AuthManager(tmpDir);
    const result = manager.connectApiKey('sk-ant-test-key-123');
    expect(result.success).toBe(true);

    const status = manager.getStatus();
    expect(status.connected).toBe(true);
    expect(status.method).toBe('api-key');
    expect(status.account).toBeDefined();
  });

  it('rejects empty API key', () => {
    const manager = new AuthManager(tmpDir);
    const result = manager.connectApiKey('');
    expect(result.success).toBe(false);
    expect(result.error).toBe('API key cannot be empty');
  });

  it('rejects whitespace-only API key', () => {
    const manager = new AuthManager(tmpDir);
    const result = manager.connectApiKey('   ');
    expect(result.success).toBe(false);
  });

  it('trims whitespace from API key', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('  my-key  ');
    expect(manager.getApiKey()).toBe('my-key');
  });

  it('persists API key across instances', () => {
    const m1 = new AuthManager(tmpDir);
    m1.connectApiKey('sk-ant-persistent');
    const m2 = new AuthManager(tmpDir);
    expect(m2.getStatus().connected).toBe(true);
    expect(m2.getApiKey()).toBe('sk-ant-persistent');
  });

  it('isAuthenticated returns true with API key', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('sk-ant-test');
    expect(manager.isAuthenticated()).toBe(true);
  });

  // ── Auth env ──

  it('getAuthEnv returns ANTHROPIC_API_KEY when using API key', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('sk-ant-test-key');
    const env = manager.getAuthEnv();
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-test-key' });
  });

  it('getAuthEnv returns undefined when disconnected', () => {
    const manager = new AuthManager(tmpDir);
    expect(manager.getAuthEnv()).toBeUndefined();
  });

  // ── Disconnect ──

  it('disconnects and removes stored key', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('sk-ant-some-key');
    manager.disconnect();
    expect(manager.getStatus().connected).toBe(false);
    expect(manager.getApiKey()).toBeNull();
  });

  it('disconnect removes the auth file', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('sk-ant-some-key');
    manager.disconnect();
    expect(fs.existsSync(path.join(tmpDir, 'auth.json'))).toBe(false);
  });

  it('disconnect is safe when already disconnected', () => {
    const manager = new AuthManager(tmpDir);
    expect(() => manager.disconnect()).not.toThrow();
  });

  // ── Key redaction ──

  it('redacts long API keys', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('sk-ant-test-key-1234567890');
    expect(manager.getStatus().account).toBe('sk-...890');
  });

  it('redacts short keys as ***', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('short');
    expect(manager.getStatus().account).toBe('***');
  });

  // ── CLI detection (unit-testable parts) ──

  it('detectCliAuth returns a boolean', async () => {
    const manager = new AuthManager(tmpDir);
    const result = await manager.detectCliAuth();
    expect(typeof result).toBe('boolean');
  });
});
