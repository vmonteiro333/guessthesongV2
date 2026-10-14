// scripts/inject-streams.mjs — injeta/atualiza o campo `streams` das músicas
// nas playlists, a partir de um CSV com ID do Spotify + streams.
// Uso: node scripts/inject-streams.mjs streams.csv
//
// CSV esperado (cabeçalhos aceitos em PT ou EN):
//   "Spotify ID" (ou "Track ID" / "URI da faixa") e "Streams"
// Gera backup .bak antes de escrever.

import { readdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const playlistsDir = resolve(root, "src/data/playlists");

const csvPath = process.argv[2] ?? "";
if (!csvPath) {
  console.error('Uso: node scripts/inject-streams.mjs streams.csv');
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
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function extractTrackId(value) {
  const trimmed = (value ?? "").trim();
  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/track\/([A-Za-z0-9]{22})/);
  return m ? m[1] : null;
}

const raw = readFileSync(resolve(root, csvPath), "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(raw);
const header = rows[0].map((h) => h.trim());
const idx = (...names) => {
  for (const name of names) {
    const i = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
};
const idCol = idx("Spotify ID", "Track ID");
const uriCol = idx("Track URI", "URI da faixa");
const streamsCol = idx("Streams");

if (streamsCol === -1 || (idCol === -1 && uriCol === -1)) {
  console.error("✖ CSV precisa de colunas 'Spotify ID' (ou 'Track URI') e 'Streams'. Cabeçalhos: " + header.join(" | "));
  process.exit(1);
}

const streamsById = new Map();
let invalid = 0;
for (const row of rows.slice(1)) {
  const id = extractTrackId(idCol !== -1 ? row[idCol] : row[uriCol]);
  const streams = Number(String(row[streamsCol] ?? "").replace(/[.,\s]/g, ""));
  if (!id || !Number.isFinite(streams)) { invalid += 1; continue; }
  streamsById.set(id, Math.round(streams));
}
console.log(`• CSV lido: ${streamsById.size} faixas com streams válidos (${invalid} linhas ignoradas).`);

let totalInjetadas = 0;
let totalAtualizadas = 0;
let totalSemCorrespondencia = 0;

for (const file of readdirSync(playlistsDir)) {
  if (!file.endsWith(".ts") || file === "index.ts") continue;
  const path = resolve(playlistsDir, file);
  const content = readFileSync(path, "utf8");

  copyFileSync(path, path + ".bak");

  // Remove `streams: N,` existentes (re-injeção limpa)
  let out = content.replace(/^[ \t]*streams: \d+,\r?\n/gm, "");

  // Para cada song (linha spotifyUrl), injeta streams acima se o CSV tiver
  out = out.replace(
    /^([ \t]*)spotifyUrl: "https:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})",?$/gm,
    (match, indent, id) => {
      const streams = streamsById.get(id);
      if (streams === undefined) { totalSemCorrespondencia += 1; return match; }
      if (content.includes(`track/${id}"`) && content.includes(`streams: ${streams},\n${indent}spotifyUrl: "https://open.spotify.com/track/${id}"`)) {
        totalAtualizadas += 1;
        return match;
      }
      totalInjetadas += 1;
      return `${indent}streams: ${streams},\n${indent}spotifyUrl: "https://open.spotify.com/track/${id}",`;
    }
  );

  writeFileSync(path, out, "utf8");
  console.log(`✔ ${file}: ${totalInjetadas} injetadas até agora.`);
}

console.log(`✔ Concluído: ${totalInjetadas} streams injetados, ${totalAtualizadas} já iguais, ${totalSemCorrespondencia} sem correspondência no catálogo.`);
console.log("• Backs .bak criados ao lado dos arquivos (pode apagá-los depois de conferir).");