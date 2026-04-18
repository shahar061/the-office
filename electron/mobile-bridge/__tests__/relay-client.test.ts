import { describe, it, expect } from 'vitest';
import { RelayClient } from '../relay-client';

describe('RelayClient', () => {
  const opts = {
    url: 'wss://example.test',
    sid: 'test-sid',
    mintToken: () => 'fake-token',
    pairSignPub: new Uint8Array(32),
  };

  it('construction does not throw with valid options', () => {
    expect(() => new RelayClient(opts)).not.toThrow();
  });

  it('isConnected() is false before start()', () => {
    const client = new RelayClient(opts);
    expect(client.isConnected()).toBe(false);
  });

  it('stop() is safe when never started', () => {
    const client = new RelayClient(opts);
    expect(() => client.stop()).not.toThrow();
  });

  it('send() is a no-op before connected', () => {
    const client = new RelayClient(opts);
    expect(() => client.send('hello')).not.toThrow();
  });

  it('is an EventEmitter and accepts message listeners', () => {
    const client = new RelayClient(opts);
    const received: string[] = [];
    client.on('message', (m) => received.push(m));
    // Nothing should fire; just verify wiring works
    expect(received).toHaveLength(0);
  });
});
