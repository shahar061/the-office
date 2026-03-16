import { describe, it, expect, beforeEach } from 'vitest';
import { Camera } from '../../../../src/renderer/src/office/engine/camera';

// Minimal mock container
function mockContainer() {
  return { scale: { set: () => {} }, x: 0, y: 0 } as any;
}

describe('Camera nudge', () => {
  let camera: Camera;

  beforeEach(() => {
    camera = new Camera(mockContainer());
    camera.setMapSize(640, 480);
    camera.setViewSize(960, 800);
    camera.focusOnPhase('imagine');
  });

  it('nudgeToward() shifts camera position temporarily', () => {
    // Record position before nudge
    camera.update();
    const container = (camera as any).container;
    const xBefore = container.x;

    camera.nudgeToward(100, 100, 1000);
    camera.update(); // apply nudge
    const xAfter = container.x;

    // Position should have shifted
    expect(xAfter).not.toEqual(xBefore);
  });

  it('nudge decays to zero over duration', () => {
    camera.nudgeToward(100, 100, 1000);

    const internals = camera as any;
    internals.nudgeElapsed = 2; // force past duration
    camera.update();

    expect(internals.nudgeOffsetX).toBe(0);
    expect(internals.nudgeOffsetY).toBe(0);
  });

  it('nudge does not fire when manualOverride is true', () => {
    camera.panTo(200, 200); // sets manualOverride = true
    camera.nudgeToward(100, 100, 1000);
    const internals = camera as any;
    expect(internals.nudgeDuration).toBe(0);
  });
});
