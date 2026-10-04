import { useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "../types/song";
import { normalizeText } from "../utils/normalizeText";
import { SkipIcon } from "./icons";

interface AnswerFormProps {
  value: string;
  /** Catálogo da playlist (para as sugestões). */
  catalog: Song[];
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  canType: boolean;
  canAnswer: boolean;
  canSkip: boolean;
  isLastStage: boolean;
}

interface Suggestion {
  song: Song;
  /** Rótulo do motivo: "música" ou o nome do artista que casou. */
  matchLabel: string;
}

/** Busca determinística por título OU artista (prefixo e substring). */
function buildSuggestions(query: string, catalog: Song[], excludeId?: string): Suggestion[] {
  const q = normalizeText(query);
  if (q.length === 0) return [];
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const song of catalog) {
    if (song.id === excludeId) continue;
    const title = normalizeText(song.title);
    const artist = normalizeText(song.artist);
    let matchLabel: string | null = null;
    if (title === q) matchLabel = "música";
    else if (title.startsWith(q)) matchLabel = "música";
    else if (artist === q || artist.includes(q)) matchLabel = song.artist.split(",")[0].trim();
    else {
      for (const alias of song.artistAliases ?? []) {
        const a = normalizeText(alias);
        if (a === q || a.includes(q)) {
          matchLabel = alias;
          break;
        }
      }
    }
    if (!matchLabel) continue;
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    out.push({ song, matchLabel });
    if (out.length >= 8) break;
  }
  // Título > artista; depois ordem do catálogo.
  return out.sort((a, b) => {
    const aTitle = a.matchLabel === "música" ? 0 : 1;
    const bTitle = b.matchLabel === "música" ? 0 : 1;
    if (aTitle !== bTitle) return aTitle - bTitle;
    return 0;
  });
}

export default function AnswerForm({
  value,
  catalog,
  onChange,
  onSubmit,
  onSkip,
  canType,
  canAnswer,
  canSkip,
  isLastStage,
}: AnswerFormProps) {
  const [menuOpen, setMenuOpen] = useState(false);
    // Debounce: sugestões só após 350ms parado + mínimo de 3 caracteres.
  // Equilíbrio: a lista continua ajudando quem JÁ sabe o que procura,
  // mas deixa de ser "resposta de graça" por digitação mínima.
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasInput = value.trim().length > 0;

  useEffect(() => {
    const norm = normalizeText(value);
    if (norm.length < 3) {
      setDebounced("");
      return;
    }
    const timer = window.setTimeout(() => setDebounced(value), 350);
    return () => window.clearTimeout(timer);
  }, [value]);

  const suggestions = useMemo(
    () => buildSuggestions(debounced, catalog),
    [debounced, catalog]
  );

  // Fecha o menu ao clicar fora.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  // Reset do cursor quando as sugestões mudam.
  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  useEffect(() => {
    if (!canAnswer) return;
    if (typeof window === "undefined" || !window.matchMedia("(hover: hover)").matches) return;
    inputRef.current?.focus();
  }, [canAnswer]);

  const selectSuggestion = (song: Song): void => {
    onChange(song.title);
    setMenuOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!canAnswer) return;
    if (menuOpen && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        selectSuggestion(suggestions[activeIndex].song);
        return;
      }
      if (event.key === "Enter") {
        // Enter com menu aberto: se há sugestão destacada e o texto não é
        // exatamente ela, seleciona; senão, envia o palpite.
        const active = suggestions[activeIndex];
        if (active && normalizeText(value) !== normalizeText(active.song.title)) {
          event.preventDefault();
          selectSuggestion(active.song);
          return;
        }
        event.preventDefault();
        onSubmit();
        return;
      }
    }
    if (event.key === "Enter" && canAnswer && hasInput) {
      event.preventDefault();
      onSubmit();
    }
  };

  const showMenu =
    menuOpen && canAnswer && suggestions.length > 0 && debounced.trim() !== "";

  return (
    <form
      className="answer-form panel"
      aria-label="Sua resposta"
      onSubmit={(event) => {
        event.preventDefault();
        if (canAnswer && hasInput) onSubmit();
      }}
    >
      <h2 className="panel-title">Sua vez</h2>

      <div className="field">
        <label htmlFor="answer-title">Música</label>
        <div className="suggest" ref={wrapRef}>
          <input
            ref={inputRef}
            id="answer-title"
            name="title"
            type="text"
            className="suggest-input"
            value={value}
            placeholder="Digite a música ou o artista…"
            autoComplete="off"
            spellCheck={false}
            disabled={!canType}
            aria-describedby="answer-help"
            aria-expanded={showMenu}
            aria-controls="suggest-menu"
            role="combobox"
            onChange={(event) => {
              onChange(event.target.value);
              setMenuOpen(true);
            }}
            onFocus={() => setMenuOpen(true)}
            onKeyDown={onKeyDown}
          />
          {value !== "" && canType && (
            <button
              type="button"
              className="suggest-clear"
              aria-label="Limpar resposta"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          )}
          {showMenu && (
            <div className="suggest-menu" id="suggest-menu" role="listbox">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.song.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={
                    index === activeIndex
                      ? "suggest-option suggest-option--active"
                      : "suggest-option"
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectSuggestion(suggestion.song)}
                >
                  <span className="suggest-option-title">{suggestion.song.title}</span>
                  <span className="suggest-option-artist">{suggestion.matchLabel}</span>
                </button>
              ))}
            </div>
          )}
          {menuOpen && canAnswer && suggestions.length === 0 && debounced.trim() !== "" && (
            <div className="suggest-menu">
              <p className="suggest-empty">
                Nada no catálogo com esse texto — pode enviar assim mesmo (Enter).
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="hint" id="answer-help">
        Digite e selecione a música da lista (ou envie o que escreveu).{" "}
        <kbd>Enter</kbd> envia · <kbd>↑</kbd>/<kbd>↓</kbd> navegam · <kbd>Tab</kbd> seleciona.
      </p>

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!canAnswer || !hasInput}>
          Tentar
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSkip} disabled={!canSkip}>
          <SkipIcon />
          {isLastStage ? "Não sei — encerrar" : "Pular etapa"}
        </button>
      </div>
    </form>
  );
}