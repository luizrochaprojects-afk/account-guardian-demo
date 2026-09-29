/**
 * Deterministic helpers for the seed: stable ids, a seeded random stream, and
 * dates relative to "now" so the demo never looks old.
 */

/** FNV-1a, 32-bit. */
function fnv1a(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A stable, well-formed v4-shaped UUID derived from a key. The same key always
 * yields the same id, so links (and a visitor's saved edits) survive reloads.
 */
export function sid(...parts: string[]): string {
  const key = parts.join(':');
  const hex = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((s) => fnv1a(key, s).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** mulberry32 — small, fast, good enough for fake data. */
export function rng(seed: string) {
  let a = fnv1a(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    chance: (p: number) => next() < p,
  };
}

export type Clock = ReturnType<typeof makeClock>;

/** Dates relative to the moment the seed is built. */
export function makeClock(now: Date) {
  const base = now.getTime();
  const DAY = 86_400_000;
  /** ISO timestamp `days` ago (negative = in the future), at a local hour. */
  const at = (days: number, hour = 10, minute = 0) => {
    const d = new Date(base - days * DAY);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  /** Local calendar date `days` ago, as YYYY-MM-DD. */
  const day = (days: number) => {
    const d = new Date(base - days * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return { now: base, at, day };
}
