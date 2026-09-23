// scripts/convert-csv.mjs — v2 (aceita CSV do Exportify em inglês OU português)
// Uso: node scripts/convert-csv.mjs playlist.csv

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const csvPath = process.argv[2] ?? "";
if (!csvPath) {
  console.error("Uso: node scripts/convert-csv.mjs playlist.csv");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const raw = readFileSync(resolve(root, csvPath), "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(raw);
if (rows.length < 2) {
  console.error("CSV vazio ou inválido.");
  process.exit(1);
}

const header = rows[0].map((h) => h.trim());
const colIndex = (...names) => {
  for (const name of names) {
    const index = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    if (index !== -1) return index;
  }
  return -1;
};

// Colunas em inglês OU português, conforme o idioma do Exportify
const idCol = colIndex("Spotify ID", "Track ID");
const uriCol = colIndex("Track URI", "URI da faixa");
const titleCol = colIndex("Track Name", "Nome da faixa");
const artistCol = colIndex("Artist Name(s)", "Nome(s) do artista");
const previewCol = colIndex("Preview URL", "URL de prévia da faixa");

if (titleCol === -1 || artistCol === -1 || (idCol === -1 && uriCol === -1)) {
  console.error("Colunas esperadas não encontradas. Cabeçalhos no arquivo: " + header.join(" | "));
  process.exit(1);
}

/** Extrai o ID de 22 caracteres do ID puro ou do URI "spotify:track:ID". */
function extractTrackId(value) {
  const trimmed = (value ?? "").trim();
  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed;
  const fromUri = trimmed.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  return fromUri ? fromUri[1] : null;
}

const seen = new Set();
const songs = [];
let withoutPreview = 0;

for (const row of rows.slice(1)) {
  const id = extractTrackId(idCol !== -1 ? row[idCol] : row[uriCol]);
  const title = (row[titleCol] ?? "").trim();
  const artist = (row[artistCol] ?? "").trim();
  if (!id || title === "" || seen.has(id)) continue;
  seen.add(id);
  if (previewCol !== -1 && (row[previewCol] ?? "").trim() === "") withoutPreview += 1;
  const artists = artist.split(",").map((a) => a.trim()).filter(Boolean);
  const aliases = artists
    .filter((name) => name.includes(","))
    .map((name) => name.replace(/,/g, "").replace(/\s+/g, " ").trim());
  songs.push({
    id: "song-" + String(songs.length + 1).padStart(3, "0"),
    title,
    artist: artists.join(", "),
    ...(aliases.length > 0 ? { artistAliases: aliases } : {}),
    spotifyUrl: "https://open.spotify.com/track/" + id,
  });
}

if (songs.length === 0) {
  console.error("Nenhuma faixa válida no CSV.");
  process.exit(1);
}

const lines = [
  'import type { Song } from "../types/song";',
  "",
  "// GERADO AUTOMATICAMENTE a partir do CSV do Exportify — evite editar à mão.",
  "// Gerado em: " + new Date().toISOString().slice(0, 10) + " — " + songs.length + " músicas.",
  "",
  "export const songs: Song[] = [",
];
for (const song of songs) {
  const parts = [
    "id: " + JSON.stringify(song.id),
    "title: " + JSON.stringify(song.title),
    "artist: " + JSON.stringify(song.artist),
    song.artistAliases ? "artistAliases: " + JSON.stringify(song.artistAliases) : null,
    "spotifyUrl: " + JSON.stringify(song.spotifyUrl),
  ].filter(Boolean);
  lines.push("  {");
  lines.push("    " + parts.join(",\n    ") + ",");
  lines.push("  },");
}
lines.push("];");
lines.push("");
writeFileSync(resolve(root, "src/data/songs.ts"), lines.join("\n"), "utf8");

console.log("✔ " + songs.length + " músicas escritas em src/data/songs.ts.");
if (previewCol !== -1 && withoutPreview > 0) {
  console.log(
    "⚠ " + withoutPreview + " delas estão SEM prévia no CSV — devem virar 'Indisponível' no jogo."
  );
}