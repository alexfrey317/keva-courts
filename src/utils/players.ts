/**
 * Canonical key for matching a roster name across teams: trimmed, lowercased,
 * with internal whitespace collapsed. Every roster comparison must use this so
 * a name with a stray double space still matches itself.
 */
export function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
