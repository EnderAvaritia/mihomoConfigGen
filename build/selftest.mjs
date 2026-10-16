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
  extractPolicies,
  composeRule,
  validateRules,
  injectRules,
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
check("line count is 549", countLines(template) === 549);

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

console.log("extractPolicies");
{
  var policies = extractPolicies(template);
  check("includes 🚀 节点选择", policies.indexOf("🚀 节点选择") !== -1);
  check("includes 🎯 直连地址", policies.indexOf("🎯 直连地址") !== -1);
  check("includes 🐟 漏网之鱼", policies.indexOf("🐟 漏网之鱼") !== -1);
  check("more than 10 policies", policies.length > 10);

  var hasDup = false;
  for (var pi = 0; pi < policies.length; pi++) {
    if (policies.indexOf(policies[pi]) !== pi) { hasDup = true; break; }
  }
  check("no duplicate policies", hasDup === false);
}

console.log("composeRule");
check("basic 3 comma parts", composeRule("DOMAIN-SUFFIX", "google.com", "🚀 节点选择", "") === "DOMAIN-SUFFIX,google.com,🚀 节点选择");
check("with opts -> 4 comma parts", composeRule("IP-CIDR", "1.2.3.4/32", "DIRECT", "no-resolve").split(",").length === 4);
check("empty policy -> 2 comma parts", composeRule("DOMAIN-SUFFIX", "google.com", "", "") === "DOMAIN-SUFFIX,google.com");

console.log("validateRules");
{
  var vr = validateRules(["DOMAIN-SUFFIX,a.com,🚀 节点选择", "   ", "IP-CIDR,1.2.3.4/32,DIRECT", "", "DOMAIN-SUFFIX,a.com,🚀 节点选择"]);
  check("skips blank/whitespace rows", vr.list.length === 2);
  check("keeps original order", vr.list[0] === "DOMAIN-SUFFIX,a.com,🚀 节点选择" && vr.list[1] === "IP-CIDR,1.2.3.4/32,DIRECT");
  check("detects duplicate (1 err)", vr.errs.length === 1 && /重复规则/.test(vr.errs[0]));
  check("list excludes the duplicate", vr.list.indexOf("DOMAIN-SUFFIX,a.com,🚀 节点选择") === 0 && vr.list.lastIndexOf("DOMAIN-SUFFIX,a.com,🚀 节点选择") === 0);
}

console.log("injectRules (real template)");
{
  var userRules = ["DOMAIN-SUFFIX,a.com,🚀 节点选择", "IP-CIDR,1.2.3.4/32,DIRECT"];
  var rout = injectRules(template, userRules);
  var rl = rout.split("\n");
  var tl = template.split("\n");

  var ri = -1;
  for (var a = 0; a < tl.length; a++) if (/^rules:\s*$/.test(tl[a])) { ri = a; break; }

  check("first user rule is first list item after rules:", rl[ri + 1] === "  - " + userRules[0]);
  check("both rule strings present", rout.indexOf(userRules[0]) !== -1 && rout.indexOf(userRules[1]) !== -1);
  check("prefix up to and including rules: unchanged", rl.slice(0, ri + 1).join("\n") === tl.slice(0, ri + 1).join("\n"));
  check("line count is original + rules.length", rl.length === tl.length + userRules.length);
  check("suffix (original rules content) unchanged", rl.slice(ri + 1 + userRules.length).join("\n") === tl.slice(ri + 1).join("\n"));
}

console.log("injectRules (empty list -> unchanged)");
check("empty list returns template byte-identical", injectRules(template, []) === template);

console.log("injectRules (missing key -> throws)");
assertThrows("throws when rules key absent", function () { injectRules("mode: rule\n", ["DOMAIN-SUFFIX,a.com,DIRECT"]); });

console.log("injectRules (inline empty list)");
{
  var iout = injectRules("rules: []\nmode: rule\n", ["DOMAIN-SUFFIX,a.com,DIRECT"]);
  var il = iout.split("\n");
  check("inline list becomes bare rules:", il[0] === "rules:");
  check("inserted rule follows rules: line", il[1] === "  - DOMAIN-SUFFIX,a.com,DIRECT");
  check("rest of document unchanged", il[2] === "mode: rule");
}

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);