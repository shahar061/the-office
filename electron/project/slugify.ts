/**
 * Convert a free-form title to a slug safe for git branch names.
 * Rules: lowercase, non-alphanumerics → '-', collapse repeats, trim
 * leading/trailing dashes, truncate to 50 chars, trim trailing dash
 * again after truncation. Empty/all-special input returns "untitled".
 */
export function slugifyTitle(title: string): string {
  const lowered = title.toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9]+/g, '-');
  const collapsed = replaced.replace(/-+/g, '-');
  const trimmed = collapsed.replace(/^-+|-+$/g, '');
  if (!trimmed) return 'untitled';
  const truncated = trimmed.slice(0, 50);
  const finalTrimmed = truncated.replace(/-+$/, '');
  return finalTrimmed || 'untitled';
}
