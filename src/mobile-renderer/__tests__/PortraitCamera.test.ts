/**
 * @vitest environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PortraitCamera } from '../PortraitCamera';

// Mock Container with proper set methods
class MockContainer {
  position = { x: 0, y: 0, set: function(x: number, y: number) { this.x = x; this.y = y; } };
  scale = { x: 1, y: 1, set: function(val: number) { this.x = val; this.y = val; } };
}

describe('PortraitCamera', () => {
  let container: any;
  let camera: PortraitCamera;

  beforeEach(() => {
    container = new MockContainer();
    camera = new PortraitCamera(container);
    camera.setViewport(400, 600);
    camera.setMapSize(640, 480);
  });

  it('locks zoom at 2.0x', () => {
    expect(camera.getZoom()).toBe(2.0);
  });

  it('follows the active character when one is set', () => {
    camera.setActiveCharacter({ x: 300, y: 200 });
    // simulate enough time to settle
    for (let i = 0; i < 200; i++) camera.tick(16);
    const pos = camera.getPosition();
    // Lerp smooth — should be close to 300,200, not exactly
    expect(Math.abs(pos.x - 300)).toBeLessThan(5);
    expect(Math.abs(pos.y - 200)).toBeLessThan(5);
  });

  it('falls back to phase centroid after idle > 5s', () => {
    camera.setActiveCharacter({ x: 300, y: 200 });
    for (let i = 0; i < 200; i++) camera.tick(16);
    camera.setActiveCharacter(null);
    // Use a centroid that's within clamp bounds (halfW=100, halfH=150 given 400x600 viewport and 2x zoom)
    camera.setPhaseCentroid({ x: 200, y: 200 });
    // Advance clock past 5s threshold and let camera settle
    for (let i = 0; i < 400; i++) camera.tick(16);
    const pos = camera.getPosition();
    expect(Math.abs(pos.x - 200)).toBeLessThan(20);
    expect(Math.abs(pos.y - 200)).toBeLessThan(20);
  });

  it('clamps position to map bounds', () => {
    camera.setActiveCharacter({ x: -1000, y: -1000 });
    for (let i = 0; i < 500; i++) camera.tick(16);
    const pos = camera.getPosition();
    expect(pos.x).toBeGreaterThanOrEqual(100);
    expect(pos.y).toBeGreaterThanOrEqual(150);
  });

  it('applies the transform to the container', () => {
    camera.setActiveCharacter({ x: 320, y: 240 });
    for (let i = 0; i < 200; i++) camera.tick(16);
    // Scale is locked at 2.0
    expect(container.scale.x).toBeCloseTo(2.0);
    expect(container.scale.y).toBeCloseTo(2.0);
  });
});
