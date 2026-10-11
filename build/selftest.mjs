// Self-test for the shared core. Run: node build/selftest.mjs
// Verifies the exact logic that is inlined into index.html.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  injectProviders,
  buildProvidersBlock,
  hasAnchor,
  yamlString,
  yamlKey,
  validateProviders,
  countLines,
} from "./core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const template = readFileSync(join(root, "template.yaml"), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; console.error("  FAIL " + name); }
}
function assertThrows(name, fn) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  check(name, threw);
}

console.log("template.yaml");
check("has &p anchor", hasAnchor(template) === true);
check("line count is 536", countLines(template) === 536);

console.log("yamlString / yamlKey");
check('yamlString basic', yamlString("https://a/b") === '"https://a/b"');
check('yamlString escapes quote', yamlString('a"b') === '"a\\"b"');
check('yamlString escapes backslash', yamlString("a\\b") === '"a\\\\b"');
check('yamlKey bare ok', yamlKey("custom_name1") === "custom_name1");
check('yamlKey quotes spaces', yamlKey("my sub") === '"my sub"');

console.log("validateProviders");
{
  const r = validateProviders([
    { name: "a", url: "https://x" },
    { name: "", url: "" },              // blank row -> skipped
    { name: "b", url: "https://y" },
  ]);
  check("skips blank rows, keeps 2", r.list.length === 2 && r.errs.length === 0);
}
{
  const r = validateProviders([{ name: "a", url: "https://x" }, { name: "a", url: "https://y" }]);
  check("detects duplicate name", r.errs.length === 1 && /重复/.test(r.errs[0]));
}
{
  const r = validateProviders([{ name: "a", url: "" }]);
  check("detects empty url", r.errs.length === 1 && /链接不能为空/.test(r.errs[0]));
}
{
  const r = validateProviders([{ name: "", url: "https://x" }]);
  check("detects empty name", r.errs.length === 1 && /名称不能为空/.test(r.errs[0]));
}
{
  const r = validateProviders([{ name: "", url: "" }]);
  check("all-empty -> prompts at least one", r.errs.length === 1 && /至少/.test(r.errs[0]));
}

console.log("buildProvidersBlock");
{
  const block = buildProvidersBlock([{ name: "n1", url: "https://u1" }, { name: "n2", url: "https://u2" }], true);
  const text = block.join("\n");
  check("starts with proxy-providers:", block[0] === "proxy-providers:");
  check("uses merge key when anchor exists", text.includes("<<: *p"));
  check("contains both urls", text.includes('url: "https://u1"') && text.includes('url: "https://u2"'));
  check("contains both names", text.includes("  n1:") && text.includes("  n2:"));
}

console.log("injectProviders (real template)");
{
  const list = [
    { name: "custom_name1", url: "https://sub.example.com/a?token=1" },
    { name: "custom_name2", url: "https://sub.example.com/b?token=2" },
  ];
  const out = injectProviders(template, list);
  const outLines = out.split("\n");
  const tmplLines = template.split("\n");

  // locate block in the ORIGINAL template
  let s = -1;
  for (let i = 0; i < tmplLines.length; i++) if (/^proxy-providers:\s*$/.test(tmplLines[i])) { s = i; break; }
  let e = tmplLines.length;
  for (let j = s + 1; j < tmplLines.length; j++) {
    if (/^[^\s#]/.test(tmplLines[j]) && /^[^\s#][^:]*:/.test(tmplLines[j])) { e = j; break; }
  }

  const prefixSame = outLines.slice(0, s).join("\n") === tmplLines.slice(0, s).join("\n");
  const suffixSame = outLines.slice(outLines.length - (tmplLines.length - e)).join("\n") === tmplLines.slice(e).join("\n");
  check("prefix before proxy-providers unchanged", prefixSame);
  check("suffix after block (proxies: ...) unchanged", suffixSame);

  // the block region must now hold exactly our providers
  let s2 = -1;
  for (let i = 0; i < outLines.length; i++) if (/^proxy-providers:\s*$/.test(outLines[i])) { s2 = i; break; }
  let e2 = outLines.length;
  for (let j = s2 + 1; j < outLines.length; j++) {
    if (/^[^\s#]/.test(outLines[j]) && /^[^\s#][^:]*:/.test(outLines[j])) { e2 = j; break; }
  }
  const block = outLines.slice(s2, e2).join("\n");
  check("block has 2 providers", (block.match(/<<: \*p/g) || []).length === 2);
  check("block urls present", block.includes('url: "https://sub.example.com/a?token=1"') && block.includes('url: "https://sub.example.com/b?token=2"'));
  check("no leftover empty url", !/url:\s*""/.test(out));

  // no lines dropped/duplicated: prefix + newBlock + suffix must reassemble exactly
  const newBlockLen = outLines.slice(s2, e2).length;
  check("output line count sane", outLines.length === s + newBlockLen + (tmplLines.length - e));
}

console.log("injectProviders (fallback, no anchor)");
{
  const mini = "mode: rule\nproxy-providers:\n  old:\n    url: \"\"\nproxies: []\n";
  const out = injectProviders(mini, [{ name: "p1", url: "https://z" }]);
  check("fallback inlines type: http", out.includes("    type: http"));
  check("fallback keeps proxies: section", out.includes("proxies: []"));
  check("fallback no *p reference", !out.includes("*p"));
}

console.log("injectProviders (missing key -> throws)");
assertThrows("throws when proxy-providers absent", () => injectProviders("mode: rule\n", []));

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);