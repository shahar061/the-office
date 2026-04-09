import { Graphics, Container } from 'pixi.js'

const GLOW_COLOR = 0x4488ff
const GLOW_ALPHA = 0.3
const FADE_DURATION = 0.3 // seconds

interface GlowState {
  overlay: Graphics
  targetAlpha: number
  currentAlpha: number
}

export class MonitorGlow {
  readonly container: Container
  private glows: Map<string, GlowState> = new Map()

  constructor(rects: Map<string, { x: number; y: number; width: number; height: number }>) {
    this.container = new Container()
    this.container.label = 'monitor-glow'

    for (const [name, rect] of rects) {
      const overlay = new Graphics()
      overlay.rect(rect.x, rect.y, rect.width, rect.height)
      overlay.fill({ color: GLOW_COLOR, alpha: 1 })
      overlay.alpha = 0
      overlay.blendMode = 'add'

      this.container.addChild(overlay)

      // Key by seat name without "monitor-" prefix (e.g., "monitor-pc-1" → "pc-1")
      const seatName = name.replace('monitor-', '')
      this.glows.set(seatName, { overlay, targetAlpha: 0, currentAlpha: 0 })
    }
  }

  setGlowing(seatName: string, on: boolean): void {
    const state = this.glows.get(seatName)
    if (!state) return
    state.targetAlpha = on ? GLOW_ALPHA : 0
  }

  isGlowing(seatName: string): boolean {
    const state = this.glows.get(seatName)
    if (!state) return false
    return state.targetAlpha > 0
  }

  update(dt: number): void {
    const speed = GLOW_ALPHA / FADE_DURATION
    for (const state of this.glows.values()) {
      if (state.currentAlpha < state.targetAlpha) {
        state.currentAlpha = Math.min(state.currentAlpha + speed * dt, state.targetAlpha)
      } else if (state.currentAlpha > state.targetAlpha) {
        state.currentAlpha = Math.max(state.currentAlpha - speed * dt, state.targetAlpha)
      }
      state.overlay.alpha = state.currentAlpha
    }
  }

  destroy(): void {
    for (const state of this.glows.values()) {
      state.overlay.destroy()
    }
    this.container.destroy()
  }
}
