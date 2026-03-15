import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionHandler } from '../../electron/sdk/permission-handler';
import type { PermissionRequest } from '../../shared/types';

describe('PermissionHandler', () => {
  let sendRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendRequest = vi.fn();
  });

  describe('auto-all mode', () => {
    it('auto-approves all tools without calling sendRequest', async () => {
      const handler = new PermissionHandler('auto-all', sendRequest);
      const result = await handler.handleToolRequest('Bash', { command: 'rm -rf /' }, 'backend-engineer');
      expect(result.behavior).toBe('allow');
      expect(sendRequest).not.toHaveBeenCalled();
    });

    it('auto-approves safe tools as well', async () => {
      const handler = new PermissionHandler('auto-all', sendRequest);
      const result = await handler.handleToolRequest('Read', { file_path: '/foo.ts' }, 'ceo');
      expect(result.behavior).toBe('allow');
      expect(sendRequest).not.toHaveBeenCalled();
    });
  });

  describe('auto-safe mode', () => {
    it('auto-approves Read', async () => {
      const handler = new PermissionHandler('auto-safe', sendRequest);
      const result = await handler.handleToolRequest('Read', { file_path: '/foo.ts' }, 'ceo');
      expect(result.behavior).toBe('allow');
      expect(sendRequest).not.toHaveBeenCalled();
    });

    it('auto-approves Grep', async () => {
      const handler = new PermissionHandler('auto-safe', sendRequest);
      const result = await handler.handleToolRequest('Grep', { pattern: 'foo' }, 'ceo');
      expect(result.behavior).toBe('allow');
      expect(sendRequest).not.toHaveBeenCalled();
    });

    it('auto-approves Glob', async () => {
      const handler = new PermissionHandler('auto-safe', sendRequest);
      const result = await handler.handleToolRequest('Glob', { pattern: '**/*.ts' }, 'ceo');
      expect(result.behavior).toBe('allow');
      expect(sendRequest).not.toHaveBeenCalled();
    });

    it('auto-approves WebSearch', async () => {
      const handler = new PermissionHandler('auto-safe', sendRequest);
      const result = await handler.handleToolRequest('WebSearch', { query: 'test' }, 'ceo');
      expect(result.behavior).toBe('allow');
      expect(sendRequest).not.toHaveBeenCalled();
    });

    it('auto-approves WebFetch', async () => {
      const handler = new PermissionHandler('auto-safe', sendRequest);
      const result = await handler.handleToolRequest('WebFetch', { url: 'https://example.com' }, 'ceo');
      expect(result.behavior).toBe('allow');
      expect(sendRequest).not.toHaveBeenCalled();
    });

    it('prompts for unsafe tool (Bash) and allows when approved', async () => {
      const handler = new PermissionHandler('auto-safe', sendRequest);
      const promise = handler.handleToolRequest('Bash', { command: 'ls' }, 'devops');

      expect(sendRequest).toHaveBeenCalledTimes(1);
      const req: PermissionRequest = sendRequest.mock.calls[0][0];
      expect(req.toolName).toBe('Bash');
      expect(req.agentRole).toBe('devops');
      expect(req.requestId).toBeTruthy();

      handler.resolvePermission(req.requestId, true);
      const result = await promise;
      expect(result.behavior).toBe('allow');
    });

    it('prompts for unsafe tool and denies when rejected', async () => {
      const handler = new PermissionHandler('auto-safe', sendRequest);
      const promise = handler.handleToolRequest('Bash', { command: 'ls' }, 'devops');

      const req: PermissionRequest = sendRequest.mock.calls[0][0];
      handler.resolvePermission(req.requestId, false);
      const result = await promise;
      expect(result.behavior).toBe('deny');
    });
  });

  describe('ask mode', () => {
    it('prompts for safe tools too', async () => {
      const handler = new PermissionHandler('ask', sendRequest);
      const promise = handler.handleToolRequest('Read', { file_path: '/foo.ts' }, 'frontend-engineer');

      expect(sendRequest).toHaveBeenCalledTimes(1);
      const req: PermissionRequest = sendRequest.mock.calls[0][0];
      expect(req.toolName).toBe('Read');

      handler.resolvePermission(req.requestId, true);
      const result = await promise;
      expect(result.behavior).toBe('allow');
    });

    it('prompts for unsafe tools', async () => {
      const handler = new PermissionHandler('ask', sendRequest);
      const promise = handler.handleToolRequest('Bash', { command: 'pwd' }, 'backend-engineer');

      expect(sendRequest).toHaveBeenCalledTimes(1);
      const req: PermissionRequest = sendRequest.mock.calls[0][0];
      handler.resolvePermission(req.requestId, true);
      const result = await promise;
      expect(result.behavior).toBe('allow');
    });
  });

  describe('timeout', () => {
    it('denies when permission request times out', async () => {
      const handler = new PermissionHandler('ask', sendRequest, 50);
      const result = await handler.handleToolRequest('Bash', { command: 'ls' }, 'ceo');
      expect(result.behavior).toBe('deny');
      expect(result.message).toMatch(/timed out/i);
    });
  });

  describe('lastRequestId', () => {
    it('stores the last request ID', async () => {
      const handler = new PermissionHandler('ask', sendRequest);
      expect(handler.lastRequestId).toBeUndefined();

      const promise = handler.handleToolRequest('Bash', { command: 'ls' }, 'ceo');
      const id = handler.lastRequestId;
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');

      handler.resolvePermission(id!, true);
      await promise;
    });
  });

  describe('setMode', () => {
    it('changes mode at runtime', async () => {
      const handler = new PermissionHandler('auto-all', sendRequest);

      // In auto-all, Bash is allowed without prompting
      const r1 = await handler.handleToolRequest('Bash', {}, 'ceo');
      expect(r1.behavior).toBe('allow');
      expect(sendRequest).not.toHaveBeenCalled();

      // Switch to ask — now Bash should prompt
      handler.setMode('ask');
      const promise = handler.handleToolRequest('Bash', {}, 'ceo');
      expect(sendRequest).toHaveBeenCalledTimes(1);

      const req: PermissionRequest = sendRequest.mock.calls[0][0];
      handler.resolvePermission(req.requestId, false);
      const r2 = await promise;
      expect(r2.behavior).toBe('deny');
    });
  });

  describe('resolvePermission with unknown requestId', () => {
    it('does nothing for unknown requestId', () => {
      const handler = new PermissionHandler('ask', sendRequest);
      // Should not throw
      expect(() => handler.resolvePermission('nonexistent-id', true)).not.toThrow();
    });
  });
});
