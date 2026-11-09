export type AudioFailureKind = "auth" | "temporary" | "unavailable";

/** Causa de domínio; mensagens são apenas apresentação. */
export class AudioFailure extends Error {
  readonly name = "AudioFailure";

  constructor(
    readonly kind: AudioFailureKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function audioFailure(error: unknown): AudioFailure {
  if (error instanceof AudioFailure) return error;
  return new AudioFailure(
    "temporary",
    error instanceof Error ? error.message : "Falha ao conectar ao Spotify. Tente novamente.",
  );
}
