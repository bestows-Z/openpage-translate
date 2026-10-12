import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const repository = "https://github.com/bestows-Z/openpage-translate";
const release = `${repository}/releases/latest/download`;
const metadata = `// ==UserScript==
// @name         OpenPage Translate · 开源双语翻译
// @namespace    ${repository}
// @version      ${pkg.version}
// @description  免费开源网页双语翻译，本地引擎与自带密钥的有道、DeepSeek
// @author       bestows-Z
// @license      MIT
// @match        https://*/*
// @match        http://*/*
// @noframes
// @run-at       document-idle
// @sandbox      DOM
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @connect      api.deepseek.com
// @connect      openapi.youdao.com
// @connect      api.openai.com
// @connect      localhost
// @connect      127.0.0.1
// @homepageURL  ${repository}
// @supportURL   ${repository}/issues
// @downloadURL  ${release}/openpage-translate.user.js
// @updateURL    ${release}/openpage-translate.meta.js
// ==/UserScript==`;
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  outfile: "dist/openpage-translate.user.js",
  banner: { js: metadata },
  legalComments: "inline",
  minify: false,
  sourcemap: false,
  charset: "utf8",
});
await writeFile("dist/openpage-translate.meta.js", metadata + "\n");
console.log(`Built OpenPage Translate ${pkg.version}`);
