// scripts/migrate-playlist.mjs — MIGRAÇÃO ONE-SHOT:
// transforma o src/data/songs.ts antigo em src/data/playlists/principal.ts.
// Uso: node scripts/migrate-playlist.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dir = resolve(root, "src/data/playlists");
const songsPath = resolve(root, "src/data/songs.ts");

if (!existsSync(songsPath)) {
  console.error("✖ src/data/songs.ts não encontrado (já migrou?).");
  process.exit(1);
}

const raw = readFileSync(songsPath, "utf8");
const marker = "export const songs: Song[] = [";
const start = raw.indexOf(marker);
if (start === -1) {
  console.error("✖ Formato inesperado: 'export const songs: Song[] = [' não encontrado.");
  process.exit(1);
}

let body = raw.slice(start + marker.length);
const end = body.lastIndexOf("]");
if (end === -1) {
  console.error("✖ Formato inesperado: fechamento do array não encontrado.");
  process.exit(1);
}
body = body.slice(0, end).replace(/;\s*$/, "").trimEnd();

const file = [
  'import type { Playlist } from "../../types/playlist";',
  "",
  "// GERADO AUTOMATICAMENTE (migração de src/data/songs.ts) — evite editar à mão.",
  'export const playlist: Playlist = {',
  '  id: "principal",',
  '  name: "Principal",',
  "  songs: [",
  body,
  "  ],",
  "};",
  "",
].join("\n");

mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "principal.ts"), file, "utf8");
console.log("✔ Criado src/data/playlists/principal.ts (id 'principal').");

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "playlist";
}

function importName(slug) {
  return "playlist_" + slug.replace(/[^a-z0-9]/g, "_");
}

function writeIndex() {
  const files = existsSync(dir)
    ? require_dir(dir)
    : [];
  function require_dir(d) {
    // readdir via fs (importado no topo? não — uso readdirSync local)
    return readdirSyncSafe(d);
  }
  const lines = [
    'import type { Playlist } from "../../types/playlist";',
    "",
    "// GERADO AUTOMATICAMENTE pelos scripts de importação — evite editar à mão.",
    "",
  ];
  const entries = [];
  for (const f of readdirSyncSafe(dir)) {
    const slug = f.replace(/\.ts$/, "");
    const content = readFileSync(resolve(dir, f), "utf8");
    const m = content.match(/name:\s*"((?:[^"\\]|\\.)*)"/);
    entries.push({ slug, name: m ? m[1] : "Playlist " + slug });
  }
  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  for (const e of entries) {
    lines.push(`import { playlist as ${importName(e.slug)} } from "./${e.slug}";`);
  }
  lines.push("");
  lines.push("export const playlists: Playlist[] = [");
  for (const e of entries) lines.push(`  ${importName(e.slug)},`);
  lines.push("];");
  lines.push("");
  writeFileSync(resolve(dir, "index.ts"), lines.join("\n"), "utf8");
}

import { readdirSync } from "node:fs";
function readdirSyncSafe(d) {
  return readdirSync(d).filter((f) => f.endsWith(".ts") && f !== "index.ts").sort();
}

writeIndex();
console.log("✔ Gerado src/data/playlists/index.ts.");
console.log("→ Agora DELETE o arquivo antigo: del src\\data\\songs.ts");
console.log('→ (Opcional) edite o "name" em principal.ts para o nome que quiser.');