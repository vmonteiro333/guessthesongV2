// scripts/import-playlist.mjs — v4 (log detalhado em cada etapa)

import { createServer } from "node:http";
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const OUT_PATH = resolve(root, "src/data/songs.ts");

if (existsSync(resolve(root, ".env"))) {
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(SPOTIFY_[A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "http://127.0.0.1:9090/callback";
const arg = process.argv[2] ?? "";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("✖ Defina SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no .env.");
  process.exit(1);
}
if (!arg) {
  console.error('✖ Uso: node scripts/import-playlist.mjs "https://open.spotify.com/playlist/ID"');
  process.exit(1);
}

const playlistId =
  (arg.match(/playlist\/([A-Za-z0-9]+)/) ?? [])[1] ??
  (/^[A-Za-z0-9]{22}$/.test(arg) ? arg : null);
if (!playlistId) {
  console.error("✖ Link de playlist não reconhecido: " + arg);
  process.exit(1);
}

console.log("→ Passo 1/6: aguardando o login no navegador (porta 9090)...");

const state = randomUUID();
const codePromise = new Promise((resolveCode, rejectCode) => {
  const loginTimeout = setTimeout(
    () => rejectCode(new Error("Tempo esgotado aguardando o login (5 min).")),
    300_000
  );
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:9090");
    if (url.pathname !== "/callback") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const urlState = url.searchParams.get("state");
    clearTimeout(loginTimeout);
    server.close();
    if (error || !code || urlState !== state) {
      res.end("<h1>Login falhou ou foi cancelado. Volte ao terminal.</h1>");
      rejectCode(new Error("Login não concluído (" + (error ?? "sem código") + ")."));
    } else {
      res.end("<h1>Autenticado! Pode fechar esta aba e voltar ao terminal.</h1>");
      resolveCode(code);
    }
  });
  server.on("error", (err) => {
    clearTimeout(loginTimeout);
    rejectCode(new Error("Não consegui usar a porta 9090: " + err.message));
  });
  server.listen(9090, "127.0.0.1");
});

const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", "playlist-read-private playlist-read-collaborative");
authUrl.searchParams.set("state", state);

console.log("→ Abrindo o navegador para o login...");
console.log("(Se não abrir, copie este endereço no navegador):\n" + authUrl.toString() + "\n");
exec(`start "" "${authUrl.toString()}"`);

const code = await codePromise;
console.log("✔ Passo 2/6: login autorizado. Trocando o código pelo token...");

const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: "Basic " + Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  }).toString(),
});
if (!tokenRes.ok) {
  throw new Error(
    "✖ Falha ao trocar o código por token: " + tokenRes.status + " " + (await tokenRes.text())
  );
}
const token = (await tokenRes.json()).access_token;
console.log("✔ Token obtido.");

async function api(url) {
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? "1") + 1;
    console.log("• Limite de requisições; aguardando " + wait + "s...");
    await new Promise((r) => setTimeout(r, wait * 1000));
    return api(url);
  }
  if (!res.ok) {
    throw new Error("✖ Spotify respondeu " + res.status + ": " + (await res.text()));
  }
  return res.json();
}

const me = await api("https://api.spotify.com/v1/me");
console.log("✔ Passo 3/6: autenticado como " + (me.display_name ?? me.id) + " (id: " + me.id + ")");

console.log("→ Passo 4/6: buscando detalhes da playlist...");
let playlistName = "Playlist " + playlistId;
try {
  const meta = await api("https://api.spotify.com/v1/playlists/" + playlistId);
  if (meta?.name) playlistName = meta.name;
  console.log(
    "✔ Playlist: \"" + playlistName + "\" (total informado pelo Spotify: " +
      (meta?.tracks?.total ?? "?") + ")"
  );
} catch {
  console.log("• Detalhes da playlist bloqueados (restrição do dev mode). Seguindo direto pelas faixas...");
}

console.log("→ Passo 5/6: lendo as faixas...");
const all = [];
let offset = 0;
let pageNumber = 0;
for (;;) {
  pageNumber += 1;
  let page;
  try {
    page = await api(
      "https://api.spotify.com/v1/playlists/" + playlistId + "/tracks?limit=100&offset=" + offset
    );
  } catch (error) {
    if (pageNumber === 1 && String(error).includes("403")) {
      console.error(
        "\n✖ 403 também no endpoint de FAIXAS: é a restrição do Development Mode do Spotify.\n" +
          "  → Use o Plano B: Exportify (https://exportify.app) para baixar o CSV da playlist,\n" +
          "  e depois: node scripts/convert-csv.mjs playlist.csv"
      );
    }
    throw error;
  }
  const items = page.items ?? [];
  let valid = 0;
  for (const item of items) {
    const track = item?.track;
    if (!track || track.type !== "track" || typeof track.id !== "string" || track.id === "") {
      continue; // pula locais/removidas/podcasts
    }
    all.push(track);
    valid += 1;
  }
  console.log(
    "  • página " + pageNumber + ": " + items.length + " itens (" +
      valid + " faixas válidas; acumulado " + all.length + ")"
  );
  offset += items.length;
  if (page.next === null || items.length === 0) break;
}

if (all.length === 0) {
  console.error("✖ O endpoint /tracks respondeu, mas veio vazio. Informe isso ao assistente.");
  process.exit(1);
}
console.log("✔ " + all.length + " faixas lidas no total.");

const seen = new Set();
const unique = all.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));

console.log("→ Passo 6/6: gerando o arquivo...");
const songs = unique.map((track, index) => {
  const artists = (track.artists ?? []).map((a) => a.name ?? "").filter(Boolean);
  const aliases = artists
    .filter((name) => name.includes(","))
    .map((name) => name.replace(/,/g, "").replace(/\s+/g, " ").trim());
  return {
    id: "song-" + String(index + 1).padStart(3, "0"),
    title: track.name ?? "",
    artist: artists.join(", "),
    ...(aliases.length > 0 ? { artistAliases: aliases } : {}),
    spotifyUrl: "https://open.spotify.com/track/" + track.id,
  };
});

const lines = [
  'import type { Song } from "../types/song";',
  "",
  "// GERADO AUTOMATICAMENTE por `npm run import:playlist` — evite editar à mão.",
  '// Playlist: "' + playlistName + '" (id ' + playlistId + ")",
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

const content = lines.join("\n");
writeFileSync(OUT_PATH, content, "utf8");
console.log("✔ ARQUIVO GRAVADO: " + OUT_PATH + " (" + Buffer.byteLength(content, "utf8") + " bytes)");
console.log("✔ FIM — " + songs.length + ' músicas escritas (playlist "' + playlistName + '").');
if (all.length !== unique.length) {
  console.log("• " + (all.length - unique.length) + " duplicadas ignoradas.");
}