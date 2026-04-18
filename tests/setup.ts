// Provide a minimal localStorage stub for node test environment
if (typeof localStorage === 'undefined') {
  const store: Record<string, string> = {};
  global.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  } as Storage;
}

// PixiJS probes navigator.userAgent at module-load to detect Safari; satisfy it
// with a minimal stub so tests that import pixi.js run under vitest's node env.
if (typeof navigator === 'undefined') {
  (global as any).navigator = { userAgent: 'node' };
}
