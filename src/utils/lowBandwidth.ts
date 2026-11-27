// Decorative background video (~1.8MB) is pure eye candy. On slow / metered /
// weak browsers it competes with the JS needed to make the page usable, so the
// web build skips it and the existing gradient background shows instead.
// Native apps bundle the video locally (no network cost) and never call this.
type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };

export function shouldSkipDecorativeVideo(): boolean {
  if (typeof navigator === 'undefined') return false;
  try {
    const nav = navigator as Navigator & {
      connection?: NetworkInformationLike;
      deviceMemory?: number;
    };
    const conn = nav.connection;
    if (conn?.saveData) return true;
    if (conn?.effectiveType && ['slow-2g', '2g', '3g'].includes(conn.effectiveType)) return true;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  } catch {
    // Feature detection must never break first paint.
  }
  return false;
}
