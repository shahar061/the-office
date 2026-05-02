/**
 * Color tokens. Each value is a CSS custom-property reference resolved
 * against the active theme on `<html data-theme="…">` (defined in
 * `src/renderer/index.html`). Existing call-sites keep working unchanged
 * — `style={{ background: colors.bg }}` becomes
 * `style={{ background: 'var(--theme-bg)' }}`, which the browser
 * resolves at paint time. Switching themes is a single attribute change
 * — no React re-render required.
 *
 * For PixiJS contexts that need a number (e.g. `parseInt(hex.slice(1),16)`)
 * — keep using AGENT_COLORS or hard-coded values; var() doesn't resolve
 * outside CSS.
 */
export const colors = {
  bg: 'var(--theme-bg)',
  bgDark: 'var(--theme-bg-dark)',
  surface: 'var(--theme-surface)',
  surfaceLight: 'var(--theme-surface-light)',
  surfaceDark: 'var(--theme-surface-dark)',
  border: 'var(--theme-border)',
  borderLight: 'var(--theme-border-light)',
  text: 'var(--theme-text)',
  textLight: 'var(--theme-text-light)',
  textMuted: 'var(--theme-text-muted)',
  textDim: 'var(--theme-text-dim)',
  textDark: 'var(--theme-text-dark)',
  accent: 'var(--theme-accent)',
  accentPurple: 'var(--theme-accent-purple)',
  success: 'var(--theme-success)',
  error: 'var(--theme-error)',
  warning: 'var(--theme-warning)',
} as const;
