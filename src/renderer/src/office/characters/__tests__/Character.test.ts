import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Character } from '../Character';

vi.mock('../CharacterSprite', () => ({
  CharacterSprite: class MockSprite {
    container = { x: 0, y: 0, alpha: 1, zIndex: 0, destroy: vi.fn() };
    setAnimation = vi.fn();
    setPosition = vi.fn();
    setAlpha = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock('../ToolBubble', () => ({
  ToolBubble: class MockToolBubble {
    container = { x: 0, y: 0, alpha: 0, zIndex: 0, destroy: vi.fn() };
    private _publicState: { toolName: string; target?: string } | null = null;
    show = vi.fn((toolName: string, target: string) => {
      this._publicState = { toolName, target };
    });
    startLinger = vi.fn();
    hide = vi.fn(() => { this._publicState = null; });
    update = vi.fn();
    destroy = vi.fn();
    setPosition = vi.fn();
    getPublicState = vi.fn(() => this._publicState);
    setTarget = vi.fn((state: { toolName: string; target?: string } | null) => {
      if (!state) { this._publicState = null; return; }
      this._publicState = { toolName: state.toolName, target: state.target };
    });
  },
}));

const mockMapRenderer = {
  tileSize: 16,
  tileToPixel: (x: number, y: number) => ({ x: x * 16, y: y * 16 }),
  pixelToTile: (px: number, py: number) => ({ x: Math.floor(px / 16), y: Math.floor(py / 16) }),
  getSpawnPoint: () => ({ x: 1, y: 1 }),
} as any;

function makeCharacter(): Character {
  return new Character({
    agentId: 'ceo',
    role: 'ceo',
    mapRenderer: mockMapRenderer,
    frames: [[]] as any,
  });
}

describe('Character.getStateSnapshot', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns a CharacterState with all fields', () => {
    const c = makeCharacter();
    const s = c.getStateSnapshot();
    expect(s.agentId).toBe('ceo');
    expect(typeof s.x).toBe('number');
    expect(typeof s.y).toBe('number');
    expect(['up', 'down', 'left', 'right']).toContain(s.direction);
    expect(['idle', 'walk', 'read', 'type']).toContain(s.animation);
    expect(typeof s.visible).toBe('boolean');
    expect(typeof s.alpha).toBe('number');
    expect(s.toolBubble).toBeNull();
  });

  it('toolBubble populates when showToolBubble is called', () => {
    const c = makeCharacter();
    c.showToolBubble('Read', 'src/foo.ts');
    const s = c.getStateSnapshot();
    expect(s.toolBubble).toEqual({ toolName: 'Read', target: 'src/foo.ts' });
  });
});

describe('Character.applyDrivenState', () => {
  it('snaps to target when delta > 100 px', () => {
    const c = makeCharacter();
    const initial = c.getStateSnapshot();
    c.applyDrivenState({
      agentId: 'ceo', x: initial.x + 500, y: initial.y + 500,
      direction: 'down', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.016);
    const after = c.getStateSnapshot();
    expect(after.x).toBe(initial.x + 500);
    expect(after.y).toBe(initial.y + 500);
  });

  it('lerps position for small deltas', () => {
    const c = makeCharacter();
    const initial = c.getStateSnapshot();
    // dt=0.1 should reach target fully (t = min(1, 0.1/0.1) = 1)
    c.applyDrivenState({
      agentId: 'ceo', x: initial.x + 10, y: initial.y + 10,
      direction: 'down', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.1);
    const after = c.getStateSnapshot();
    expect(after.x).toBeCloseTo(initial.x + 10, 1);

    // Separate instance — verify half-interpolation at dt = 0.05
    const c2 = makeCharacter();
    const i2 = c2.getStateSnapshot();
    c2.applyDrivenState({
      agentId: 'ceo', x: i2.x + 10, y: i2.y,
      direction: 'down', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.05);
    expect(c2.getStateSnapshot().x).toBeCloseTo(i2.x + 5, 1);
  });

  it('snaps direction immediately', () => {
    const c = makeCharacter();
    c.applyDrivenState({
      agentId: 'ceo', x: 0, y: 0,
      direction: 'left', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.016);
    expect(c.getStateSnapshot().direction).toBe('left');
  });

  it('transitions toolBubble from null to populated and back', () => {
    const c = makeCharacter();
    c.applyDrivenState({
      agentId: 'ceo', x: 0, y: 0,
      direction: 'down', animation: 'read', visible: true, alpha: 1,
      toolBubble: { toolName: 'Read', target: 'foo.ts' },
    }, 0.016);
    expect(c.getStateSnapshot().toolBubble).toEqual({ toolName: 'Read', target: 'foo.ts' });

    c.applyDrivenState({
      agentId: 'ceo', x: 0, y: 0,
      direction: 'down', animation: 'idle', visible: true, alpha: 1, toolBubble: null,
    }, 0.016);
    expect(c.getStateSnapshot().toolBubble).toBeNull();
  });
});
