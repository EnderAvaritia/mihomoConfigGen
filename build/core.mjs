// Shared pure logic for the subscription-config generator.
// This file is BOTH:
//   - imported by build/selftest.mjs (Node, verified by tests), and
//   - inlined verbatim into index.html by build/build.mjs (browser runtime).
// Keeping a single source guarantees the tested code == shipped code.

export function countLines(s) {
  if (!s) { return 0; }
  var lines = s.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") { lines.pop(); }
  return lines.length;
}

export function yamlString(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

// Bare key when safe, otherwise a quoted scalar (valid YAML mapping key).
export function yamlKey(s) {
  if (/^[A-Za-z0-9_\-.\u4e00-\u9fa5]+$/.test(s)) { return s; }
  return yamlString(s);
}

// Does the template define the `&p` anchor used by `<<: *p`?
export function hasAnchor(template) {
  return /(^|[\s])&p\b/m.test(template);
}

var FALLBACK_PROPS = [
  "    type: http",
  "    interval: 86400",
  "    proxy: \uD83D\uDDFA\uFE0F \u8ba2\u9605\u66f4\u65b0",
  "    header:",
  "        User-Agent:",
  '          - "clash-verge/v2.2.8"',
  "    health-check:",
  "        enable: true",
  "        url: http://www.gstatic.com/generate_204",
  "        interval: 18000",
  "        timeout: 2000",
  "        lazy: true",
  '    exclude-filter: "\u5269\u4f59|\u94fe\u63a5|\u8fde\u63a5|\u57df\u540d|\u5b98\u7f51|\u7f51\u7ad9|\u5230\u671f|\u8fc7\u671f|\u91cd\u7f6e|\u90ae\u7bb1"'
];

// Build the replacement `proxy-providers:` YAML block (array of lines).
export function buildProvidersBlock(list, useAnchor) {
  var out = ["proxy-providers:"];
  list.forEach(function (p) {
    out.push("  " + yamlKey(p.name) + ":");
    if (useAnchor) {
      out.push("    <<: *p");
    } else {
      out.push.apply(out, FALLBACK_PROPS);
    }
    out.push("    url: " + yamlString(p.url));
    out.push("");
  });
  return out;
}

// Replace the top-level `proxy-providers:` block in `template`, leaving the
// rest of the document byte-identical. Returns the new document as a string.
export function injectProviders(template, list) {
  var nl = template.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
  var lines = template.split(/\r?\n/);

  var start = -1;
  for (var i = 0; i < lines.length; i++) {
    if (/^proxy-providers:\s*(#.*)?$/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) {
    throw new Error("\u6a21\u677f\u4e2d\u672a\u627e\u5230\u9876\u5c42\u952e proxy-providers:\uff0c\u65e0\u6cd5\u6ce8\u5165\u3002");
  }

  var end = lines.length;
  for (var j = start + 1; j < lines.length; j++) {
    var l = lines[j];
    if (/^[^\s#]/.test(l) && /^[^\s#][^:]*:/.test(l)) { end = j; break; }
  }

  var block = buildProvidersBlock(list, hasAnchor(template));
  var merged = lines.slice(0, start).concat(block, lines.slice(end));
  return merged.join(nl);
}

// Validate a raw list of {name,url}. Blank rows are skipped; returns
// {list, errs} where list are the usable entries.
export function validateProviders(providers) {
  var list = [];
  var errs = [];
  var seen = {};

  providers.forEach(function (p, i) {
    var name = (p.name || "").trim();
    var url = (p.url || "").trim();
    if (!name && !url) { return; }

    var no = i + 1;
    if (!name) { errs.push("\u7b2c " + no + " \u884c\uff1a\u8ba2\u9605\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a\u3002"); return; }
    if (!url) { errs.push("\u7b2c " + no + " \u884c\uff08" + name + "\uff09\uff1a\u8ba2\u9605\u94fe\u63a5\u4e0d\u80fd\u4e3a\u7a7a\u3002"); return; }
    if (seen[name]) { errs.push("\u8ba2\u9605\u540d\u79f0\u91cd\u590d\uff1a" + name + "\u3002"); return; }
    seen[name] = true;

    list.push({ name: name, url: url });
  });

  if (list.length === 0 && errs.length === 0) {
    errs.push("\u8bf7\u81f3\u5c11\u6dfb\u52a0\u4e00\u6761\u8ba2\u9605\uff08\u540d\u79f0 + \u94fe\u63a5\uff09\u3002");
  }
  return { list: list, errs: errs };
}