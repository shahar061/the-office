import { Texture, Rectangle } from 'pixi.js'

export interface SpriteSheetConfig {
  frameWidth: number          // pixel width of one frame (typically 16)
  frameHeight: number         // pixel height of one frame (typically 32)
  walkRow: number             // which row contains walk frames (typically 1)
  framesPerDirection: number  // walk frames per direction in that row (typically 6)
}

/**
 * Maps LimeZu character spritesheets to the 7-column x 3-row frame layout
 * that CharacterSprite expects.
 *
 * LimeZu walk row layout: 4 directions packed into one row, each with
 * framesPerDirection frames. Order: down, left, up, right.
 *
 * Output: 3 rows (down, up, right) each with 7 frames:
 *   [walk1, walk2, walk3, type1, type2, read1, read2]
 *
 * Type/read frames reuse the idle (first walk) frame since LimeZu doesn't
 * include desk animations.
 */
export class SpriteAdapter {
  /** Column offset (in direction-groups) for each direction within the walk row */
  private static readonly DIRECTION_GROUP = { down: 3, left: 2, up: 1, right: 0 }

  /** Output order matches CharacterSprite's DIRECTION_ROW: down=0, up=1, right=2 */
  private static readonly OUTPUT_DIRECTIONS: Array<'down' | 'up' | 'right'> = ['down', 'up', 'right']

  static extractFrames(sheetTexture: Texture, config: SpriteSheetConfig): Texture[][] {
    const { frameWidth, frameHeight, walkRow, framesPerDirection } = config
    const output: Texture[][] = []

    for (const dir of this.OUTPUT_DIRECTIONS) {
      const frames: Texture[] = []
      const groupStart = this.DIRECTION_GROUP[dir] * framesPerDirection

      // Extract 3 walk frames by sampling every other frame from the cycle
      for (let i = 0; i < framesPerDirection; i += 2) {
        const frame = new Rectangle(
          (groupStart + i) * frameWidth,
          walkRow * frameHeight,
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
