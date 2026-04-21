// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendPhaseHistoryRequest } from '../sendPhaseHistoryRequest';

beforeEach(() => {
  (window as any).ReactNativeWebView = undefined;
});

describe('sendPhaseHistoryRequest', () => {
  it('posts the request with a generated requestId', () => {
    const postMessage = vi.fn();
    (window as any).ReactNativeWebView = { postMessage };

    const requestId = sendPhaseHistoryRequest('warroom');
    expect(postMessage).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(sent.type).toBe('requestPhaseHistory');
    expect(sent.phase).toBe('warroom');
    expect(sent.requestId).toBe(requestId);
    expect(typeof requestId).toBe('string');
  });

  it('is a safe no-op when ReactNativeWebView is absent', () => {
    expect(() => sendPhaseHistoryRequest('build')).not.toThrow();
  });
});
