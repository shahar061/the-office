/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendAnswer } from '../sendAnswer';

const originalHost = (globalThis as any).window?.ReactNativeWebView;

afterEach(() => {
  (globalThis as any).window.ReactNativeWebView = originalHost;
  vi.restoreAllMocks();
});

describe('sendAnswer', () => {
  it('posts a sendChat message to the RN host with the label body', () => {
    const postMessage = vi.fn();
    (globalThis as any).window.ReactNativeWebView = { postMessage };
    sendAnswer('Continue to War Room');
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'sendChat', body: 'Continue to War Room' }),
    );
  });

  it('warns but does not throw when no RN host is present', () => {
    delete (globalThis as any).window.ReactNativeWebView;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => sendAnswer('x')).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[sendAnswer]'));
  });
});
