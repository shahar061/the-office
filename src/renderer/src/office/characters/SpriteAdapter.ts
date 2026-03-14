import { Texture, Rectangle } from 'pixi.js'

export interface SpriteSheetConfig {
  frameWidth: number   // pixel width of one frame (typically 16)
  frameHeight: number  // pixel height of one frame (typically 32)
  columns: number      // frames per row in the source sheet
  walkFrames: number   // number of walk frames per direction (typically 3)
}

/**
 * Maps LimeZu character spritesheets to the 7-column x 3-row frame layout
 * that CharacterSprite expects.
 *
 * LimeZu layout: 4 directions (down, left, right, up) each with N walk frames.
 * Output: 3 rows (down, up, right) each with 7 frames:
 *   [walk1, walk2, walk3, type1, type2, read1, read2]
 *
 * Type/read frames reuse the idle (first walk) frame since LimeZu doesn't
 * include desk animations.
 */
export class SpriteAdapter {
  /** Source rows to extract from LimeZu sheet: down=0, up=3, right=2 */
  private static readonly SOURCE_ROWS = [0, 3, 2]

  static extractFrames(sheetTexture: Texture, config: SpriteSheetConfig): Texture[][] {
    const { frameWidth, frameHeight, walkFrames } = config
    const output: Texture[][] = []

    for (const srcRow of this.SOURCE_ROWS) {
      const frames: Texture[] = []

      // Extract walk frames (columns 0..walkFrames-1)
      for (let col = 0; col < walkFrames; col++) {
        const frame = new Rectangle(
          col * frameWidth,
          srcRow * frameHeight,
          frameWidth,
          frameHeight,
        )
        frames.push(new Texture({ source: sheetTexture.source, frame }))
      }

      // Pad to 3 walk frames if fewer
      while (frames.length < 3) {
        frames.push(frames[0])
      }

      // Type and read frames reuse idle (first walk frame)
      const idleFrame = frames[0]
      frames.push(idleFrame, idleFrame, idleFrame, idleFrame)

      output.push(frames)
    }

    return output
  }
}
