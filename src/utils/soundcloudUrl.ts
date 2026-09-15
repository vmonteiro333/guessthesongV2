const WIDGET_BASE = "https://w.soundcloud.com/player/";

/** Monta o src do iframe do widget (auto_play=false é obrigatório aqui). */
export function buildWidgetSrc(trackUrl: string): string {
  const params = new URLSearchParams({
    url: trackUrl,
    auto_play: "false",
    show_comments: "false",
    visual: "false",
    sharing: "false",
    single_active: "true",
  });
  return `${WIDGET_BASE}?${params.toString()}`;
}

/** Validação simples: precisa ser URL https de soundcloud.com. */
export function isValidSoundCloudUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    return (
      parsed.protocol === "https:" &&
      (host === "soundcloud.com" || host.endsWith(".soundcloud.com"))
    );
  } catch {
    return false;
  }
}