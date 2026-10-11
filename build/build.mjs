// Build index.html from:
//   - build/app.template.html   (app shell; markers: /*__CORE__*/ and __BUILTIN_TEMPLATE__)
//   - build/core.mjs            (shared pure logic, inlined verbatim, `export` stripped)
//   - template.yaml             (default config template, embedded inline)
//
// Run: node build/build.mjs   (from the project root)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const appSrc = readFileSync(join(here, "app.template.html"), "utf8");
const coreSrc = readFileSync(join(here, "core.mjs"), "utf8").replace(/^export\s+/gm, "");
const template = readFileSync(join(root, "template.yaml"), "utf8").replace(/\r\n/g, "\n");

for (const marker of ["/*__CORE__*/", "__BUILTIN_TEMPLATE__"]) {
  if (!appSrc.includes(marker)) {
    throw new Error(`marker not found in app.template.html: ${marker}`);
  }
}

const out = appSrc
  .replace("/*__CORE__*/", () => coreSrc)
  .replace("__BUILTIN_TEMPLATE__", () => template);

writeFileSync(join(root, "index.html"), out, "utf8");
console.log(`built index.html (${out.length} bytes, template ${template.length} bytes)`);