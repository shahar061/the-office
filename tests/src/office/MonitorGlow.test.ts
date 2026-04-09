import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('pixi.js', () => {
  class MockGraphics {
    alpha = 1
    visible = true
    blendMode = 'normal'
    rect = vi.fn().mockReturnThis()
    fill = vi.fn().mockReturnThis()
    destroy = vi.fn()
  }
  class MockContainer {
    children: any[] = []
    label = ''
    addChild(child: any) { this.children.push(child); return child }
    removeChild(child: any) { this.children = this.children.filter(c => c !== child) }
    destroy = vi.fn()
  }
  return { Graphics: MockGraphics, Container: MockContainer }
})

import { MonitorGlow } from '../../../src/renderer/src/office/MonitorGlow'

function makeRects(): Map<string, { x: number; y: number; width: number; height: number }> {
  return new Map([
    ['monitor-pc-1', { x: 10, y: 20, width: 30, height: 40 }],
    ['monitor-pc-2', { x: 50, y: 60, width: 70, height: 80 }],
  ])
}

describe('MonitorGlow', () => {
  let glow: MonitorGlow

  beforeEach(() => {
    glow = new MonitorGlow(makeRects())
  })

  it('creates a container labeled "monitor-glow"', () => {
    expect(glow.container.label).toBe('monitor-glow')
  })

  it('creates one overlay per rect', () => {
    expect(glow.container.children.length).toBe(2)
  })

  it('overlays start hidden (alpha 0)', () => {
    for (const child of glow.container.children) {
      expect((child as any).alpha).toBe(0)
    }
  })

  it('is initially not glowing for any seat', () => {
    expect(glow.isGlowing('pc-1')).toBe(false)
    expect(glow.isGlowing('pc-2')).toBe(false)
  })

  it('setGlowing(true) makes isGlowing return true', () => {
    glow.setGlowing('pc-1', true)
    expect(glow.isGlowing('pc-1')).toBe(true)
    expect(glow.isGlowing('pc-2')).toBe(false)
  })

  it('setGlowing(false) makes isGlowing return false', () => {
    glow.setGlowing('pc-1', true)
    glow.setGlowing('pc-1', false)
    expect(glow.isGlowing('pc-1')).toBe(false)
  })

  it('silently ignores unknown seat names for setGlowing', () => {
    expect(() => glow.setGlowing('unknown-seat', true)).not.toThrow()
    expect(() => glow.setGlowing('unknown-seat', false)).not.toThrow()
  })

  it('isGlowing returns false for unknown seat names', () => {
    expect(glow.isGlowing('unknown-seat')).toBe(false)
  })

  describe('update (fade animation)', () => {
    it('fades in overlay alpha toward target when glowing', () => {
      glow.setGlowing('pc-1', true)
      glow.update(0.15) // half of FADE_DURATION (0.3s)
      const child = glow.container.children[0] as any
      expect(child.alpha).toBeGreaterThan(0)
      expect(child.alpha).toBeLessThanOrEqual(0.3)
    })

    it('reaches full glow alpha after FADE_DURATION', () => {
      glow.setGlowing('pc-1', true)
      glow.update(0.3) // full FADE_DURATION
      const child = glow.container.children[0] as any
      expect(child.alpha).toBeCloseTo(0.3, 5)
    })

    it('fades out overlay alpha when glow is turned off', () => {
      glow.setGlowing('pc-1', true)
      glow.update(0.3) // fully on
      glow.setGlowing('pc-1', false)
      glow.update(0.15) // half fade out
      const child = glow.container.children[0] as any
      expect(child.alpha).toBeLessThan(0.3)
      expect(child.alpha).toBeGreaterThanOrEqual(0)
    })

    it('does not change alpha for seats not being animated', () => {
      glow.setGlowing('pc-1', true)
      glow.update(0.3)
      const child2 = glow.container.children[1] as any
      expect(child2.alpha).toBe(0)
    })
  })

  describe('destroy', () => {
    it('destroys all overlays and the container', () => {
      glow.destroy()
      expect(glow.container.destroy).toHaveBeenCalled()
      for (const child of glow.container.children) {
        expect((child as any).destroy).toHaveBeenCalled()
      }
    })
  })
})
