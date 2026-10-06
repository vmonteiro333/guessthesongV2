// scripts/append-playlist.mjs — adiciona músicas de um CSV AO FINAL de uma
// playlist existente, pulando as que já estão (dedupe por ID do Spotify).
// Uso: node scripts/append-playlist.mjs playlist.csv src/data/playlists/<slug>.ts
// NÃO altera name/description/cover. NÃO remove músicas existentes.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const csvPath = process.argv[2] ?? "";
const targetPath = process.argv[3] ?? "";

if (!csvPath || !targetPath) {
  console.error('Uso: node scripts/append-playlist.mjs <arquivo.csv> <src/data/playlists/slug.ts>');
  process.exit(1);
}

// ---------- CSV ----------
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
  console.error("✖ CSV vazio ou inválido.");
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

const idCol = colIndex("Spotify ID", "Track ID");
const uriCol = colIndex("Track URI", "URI da faixa");
const titleCol = colIndex("Track Name", "Nome da faixa");
const artistCol = colIndex("Artist Name(s)", "Nome(s) do artista");

if (titleCol === -1 || artistCol === -1 || (idCol === -1 && uriCol === -1)) {
  console.error("✖ Colunas esperadas não encontradas. Cabeçalhos: " + header.join(" | "));
  process.exit(1);
}

function extractTrackId(value) {
  const trimmed = (value ?? "").trim();
  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed;
  const fromUri = trimmed.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  return fromUri ? fromUri[1] : null;
}

// ---------- Arquivo alvo ----------
const targetRaw = readFileSync(resolve(root, targetPath), "utf8");

const SPOTIFY_URL_RE = /spotifyUrl:\s*"https:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})"/g;
const existingIds = new Set();
for (const match of targetRaw.matchAll(SPOTIFY_URL_RE)) {
  existingIds.add(match[1]);
}
console.log(`• Playlist alvo tem ${existingIds.size} músicas (lidas pelos spotifyUrl).`);

const marker = "songs: [";
const start = targetRaw.indexOf(marker);
const openBracket = targetRaw.indexOf("[", start);
const closeBracket = targetRaw.lastIndexOf("]");
if (start === -1 || closeBracket === -1) {
  console.error("✖ Não encontrei 'songs: [ ... ]' no arquivo alvo. Formato inesperado.");
  process.exit(1);
}

// ---------- Novas faixas ----------
const newSongs = [];
let skippedExisting = 0;
let seenInCsv = new Set();

for (const row of rows.slice(1)) {
  const id = extractTrackId(idCol !== -1 ? row[idCol] : row[uriCol]);
  const title = (row[titleCol] ?? "").trim();
  const artist = (row[artistCol] ?? "").trim();
  if (!id || title === "") continue;
  if (seenInCsv.has(id)) continue;
  if (existingIds.has(id)) {
    skippedExisting += 1;
    continue;
  }
  seenInCsv.add(id);
  const artists = artist.split(",").map((a) => a.trim()).filter(Boolean);
  const aliases = artists
    .filter((name) => name.includes(","))
    .map((name) => name.replace(/,/g, "").replace(/\s+/g, " ").trim());
  newSongs.push({
    id: "song-" + id.slice(0, 8) + "-" + String(newSongs.length + 1).padStart(3, "0"),
    title,
    artist: artists.join(", "),
    ...(aliases.length > 0 ? { artistAliases: aliases } : {}),
    spotifyUrl: "https://open.spotify.com/track/" + id,
  });
}

if (newSongs.length === 0) {
  console.log(
    `✔ Nada a adicionar: ${skippedExisting} faixa(s) do CSV já existem na playlist. Arquivo intacto.`
  );
  process.exit(0);
}

// ---------- Monta os blocos e insere antes do fechamento ----------
const blocks = newSongs.map((song) => {
  const parts = [
    "id: " + JSON.stringify(song.id),
    "title: " + JSON.stringify(song.title),
    "artist: " + JSON.stringify(song.artist),
    song.artistAliases ? "artistAliases: " + JSON.stringify(song.artistAliases) : null,
    "spotifyUrl: " + JSON.stringify(song.spotifyUrl),
  ].filter(Boolean);
  return "  {\n    " + parts.join(",\n    ") + ",\n  },";
});

const before = targetRaw.slice(0, closeBracket).replace(/\s*$/, "");
const after = targetRaw.slice(closeBracket);
const content =
  before +
  (before.endsWith(",") ? "\n" : ",\n") +
  blocks.join("\n") +
  "\n" +
  after;

writeFileSync(resolve(root, targetPath), content, "utf8");

console.log(`✔ ${newSongs.length} música(s) adicionada(s) ao final de ${targetPath}:`);
for (const song of newSongs) {
  console.log(`   + ${song.title} — ${song.artist}`);
}
if (skippedExisting > 0) {
  console.log(`• ${skippedExisting} faixa(s) puladas por já existirem na playlist.`);
}
console.log("• Removidas do Spotify NÃO foram tocadas — para sincronizar tudo, use o convert-csv.");