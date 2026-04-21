/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emitActiveTab } from '../emitActiveTab';

describe('emitActiveTab', () => {
  beforeEach(() => {
    (window as any).ReactNativeWebView = undefined;
  });

  it('posts the right payload to ReactNativeWebView', () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };
    emitActiveTab('chat');
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'activeTab', tab: 'chat' }));
    emitActiveTab('office');
    expect(postMessage).toHaveBeenLastCalledWith(JSON.stringify({ type: 'activeTab', tab: 'office' }));
  });

  it('is a safe no-op when ReactNativeWebView is absent', () => {
    expect(() => emitActiveTab('office')).not.toThrow();
  });
});
