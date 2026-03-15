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

  it('connects with a valid API key', () => {
    const manager = new AuthManager(tmpDir);
    const result = manager.connectApiKey('sk-ant-test-key-123');
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

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
    expect(manager.getStatus().connected).toBe(false);
  });

  it('rejects whitespace-only API key', () => {
    const manager = new AuthManager(tmpDir);
    const result = manager.connectApiKey('   ');
    expect(result.success).toBe(false);
    expect(result.error).toBe('API key cannot be empty');
  });

  it('trims whitespace from API key on connect', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('  my-key  ');
    expect(manager.getApiKey()).toBe('my-key');
  });

  it('getApiKey returns the stored key after connecting', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('sk-ant-test-key-abc');
    expect(manager.getApiKey()).toBe('sk-ant-test-key-abc');
  });

  it('persists API key across instances', () => {
    const manager1 = new AuthManager(tmpDir);
    manager1.connectApiKey('sk-ant-persistent-key');

    const manager2 = new AuthManager(tmpDir);
    expect(manager2.getStatus().connected).toBe(true);
    expect(manager2.getApiKey()).toBe('sk-ant-persistent-key');
  });

  it('disconnects and removes the stored key', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('sk-ant-some-key');
    expect(manager.getStatus().connected).toBe(true);

    manager.disconnect();
    expect(manager.getStatus().connected).toBe(false);
    expect(manager.getApiKey()).toBeNull();
  });

  it('disconnect removes the auth file', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('sk-ant-some-key');
    const authFile = path.join(tmpDir, 'auth.json');
    expect(fs.existsSync(authFile)).toBe(true);

    manager.disconnect();
    expect(fs.existsSync(authFile)).toBe(false);
  });

  it('disconnect is safe to call when already disconnected', () => {
    const manager = new AuthManager(tmpDir);
    expect(() => manager.disconnect()).not.toThrow();
    expect(manager.getStatus().connected).toBe(false);
  });

  it('new instance after disconnect starts disconnected', () => {
    const manager1 = new AuthManager(tmpDir);
    manager1.connectApiKey('sk-ant-some-key');
    manager1.disconnect();

    const manager2 = new AuthManager(tmpDir);
    expect(manager2.getStatus().connected).toBe(false);
    expect(manager2.getApiKey()).toBeNull();
  });

  it('redacts API key in status account field for long keys', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('sk-ant-test-key-1234567890');
    const status = manager.getStatus();
    expect(status.account).toBe('sk-...890');
    expect(status.account).not.toContain('ant-test-key-123456');
  });

  it('redacts short API keys as ***', () => {
    const manager = new AuthManager(tmpDir);
    manager.connectApiKey('short');
    const status = manager.getStatus();
    expect(status.account).toBe('***');
  });
});
