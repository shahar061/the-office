import { describe, it, expect, vi } from 'vitest'

vi.mock('pixi.js', () => ({
  Texture: class MockTexture {
    source: unknown
    frame: unknown
    static EMPTY = new (class MockTexture { source = null; frame = null })()
    constructor(opts?: { source?: unknown; frame?: unknown }) {
      this.source = opts?.source
      this.frame = opts?.frame
    }
  },
  Rectangle: class {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  },
}))

import { SpriteAdapter } from '../../../../src/renderer/src/office/characters/SpriteAdapter'
import { Texture } from 'pixi.js'

describe('SpriteAdapter', () => {
  it('produces 3 direction rows', () => {
    const frames = SpriteAdapter.extractFrames(Texture.EMPTY, { frameWidth: 16, frameHeight: 32, columns: 3, walkFrames: 3 })
    // down, up, right — 3 directions
    expect(frames.length).toBe(3)
  })

  it('each direction has 7 frame slots (walk*3, type*2, read*2)', () => {
    const frames = SpriteAdapter.extractFrames(Texture.EMPTY, { frameWidth: 16, frameHeight: 32, columns: 3, walkFrames: 3 })
    for (const row of frames) {
      expect(row.length).toBe(7)
    }
  })

  it('type and read frames reuse the idle frame (first walk frame)', () => {
    const frames = SpriteAdapter.extractFrames(Texture.EMPTY, { frameWidth: 16, frameHeight: 32, columns: 3, walkFrames: 3 })
    for (const row of frames) {
      // frames[3] (type1), frames[4] (type2), frames[5] (read1), frames[6] (read2)
      // should all be the same texture as frames[0] (idle/walk1)
      expect(row[3]).toBe(row[0])
      expect(row[4]).toBe(row[0])
      expect(row[5]).toBe(row[0])
      expect(row[6]).toBe(row[0])
    }
  })
})
