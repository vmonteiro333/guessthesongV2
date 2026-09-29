/**
 * Prefixo de caminhos públicos com o `base` do build (GitHub Pages).
 * No dev: "/playlists/x.jpg"; no Pages: "/guessthesongV2/playlists/x.jpg".
 */
export function assetUrl(path: string): string {
    if (!path) return path;
    const base = import.meta.env.BASE_URL || "/";
    const clean = path.startsWith("/") ? path.slice(1) : path;
    return base.endsWith("/") ? base + clean : base + "/" + clean;
  }