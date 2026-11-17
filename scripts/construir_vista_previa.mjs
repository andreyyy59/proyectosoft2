// Empaqueta el juego en UN solo archivo HTML que funciona sin servidor (modo solitario).
// Útil para compartir una demo o abrirla sin internet. Uso: npm run vista-previa
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const raiz = new URL("..", import.meta.url).pathname;
const leer = (ruta, codificacion = "utf8") => readFileSync(raiz + ruta, codificacion);
const seguro = (texto) => texto.replace(/<\/script/gi, "<\\/script");

const { outputFiles } = await build({
  entryPoints: [raiz + "app/static/js/main.js"],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  write: false,
  legalComments: "none",
});

let css = leer("app/static/css/estilos.css");
css = css.replace(/url\("\.\.\/fuentes\/([^"]+)"\)/g, (_, archivo) =>
  `url("data:font/woff2;base64,${readFileSync(raiz + "app/static/fuentes/" + archivo).toString("base64")}")`);

const config = JSON.stringify(JSON.parse(leer("compartido/config_juego.json")));

let html = leer("app/static/index.html");
html = html
  .replace(/\s*<link rel="preload"[^>]*>/, "")
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`)
  .replace(/\s*<script type="importmap">.*?<\/script>/s, "")
  .replace(/<script type="module"[^>]*><\/script>/, () =>
    `<script>window.__CONFIG_JUEGO__=${seguro(config)};window.__MODO__="solitario";</script>\n  <script>${seguro(outputFiles[0].text)}</script>`);

mkdirSync(raiz + "dist", { recursive: true });
writeFileSync(raiz + "dist/sprintquest_solitario.html", html);
console.log(`dist/sprintquest_solitario.html (${(html.length / 1024).toFixed(0)} KB)`);
