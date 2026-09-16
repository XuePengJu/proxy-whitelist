// ============================================================
// ClashMate - PAC 脚本编译模块
// 将规则条目（domain-suffix / domain / cidr / wildcard / local）
// 编译为高效的 PAC 脚本：后缀/精确用哈希表，CIDR 线性，通配用 shExpMatch
// ============================================================

(function (global) {
  "use strict";

  // --- 生成 PAC 脚本字符串 ---
  // entries: [{ type, value }]
  // proxy: { scheme, host, port }，scheme: socks5 / http
  // opts: { bypass } — bypass=true 时所有流量走代理（抓取期间用），忽略白名单
  function buildPacScript(entries, proxy, opts) {
    const bypass = !!(opts && opts.bypass);
    const suffix = [];
    const exact = [];
    const cidrs = [];
    const wildcards = [];
    let usePlainHost = false; // <local> 语义

    for (const e of entries || []) {
      if (!e || !e.value) continue;
      switch (e.type) {
        case "domain-suffix": suffix.push(e.value); break;
        case "domain": exact.push(e.value); break;
        case "cidr": cidrs.push(e.value); break;
        case "wildcard": wildcards.push(e.value); break;
        case "local": usePlainHost = true; break;
      }
    }

    // 去重（保持顺序）
    const uniq = (arr) => Array.from(new Set(arr));
    const S = uniq(suffix);
    const E = uniq(exact);
    const C = uniq(cidrs);
    const W = uniq(wildcards);

    // 代理字符串：SOCKS5 127.0.0.1:7897 / PROXY 127.0.0.1:7897
    const scheme = proxy && proxy.scheme === "http" ? "PROXY" : "SOCKS5";
    const proxyStr = `${scheme} ${proxy.host}:${proxy.port}`;

    const json = JSON.stringify({ s: S, e: E, c: C, w: W, p: proxyStr, ph: usePlainHost, by: bypass });

    // PAC 脚本：ES5 兼容（Chrome PAC 环境为 V8，支持 ES5+）
    // NOTE: Chrome requires pacScript.data to be pure ASCII. Keep this
    // template ASCII-only (no Chinese comments / full-width chars).
    const script = `
var R = ${json};
var RE_IP = /^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/;
function ipToInt(ip) {
  var p = ip.split(".");
  return ((+p[0]) * 16777216) + ((+p[1]) * 65536) + ((+p[2]) * 256) + (+p[3]);
}
function inCidr(ip, cidr) {
  var parts = cidr.split("/");
  var net = ipToInt(parts[0]);
  var bits = +parts[1];
  var mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (net & mask);
}
function FindProxyForURL(url, host) {
  var h = host.toLowerCase();
  var i, d;

  // capture bypass: all traffic goes through proxy (capture mode)
  if (R.by) return R.p;

  // <local>: hostname without dot -> DIRECT
  if (R.ph && isPlainHostName(host)) return "DIRECT";

  // IP literal -> CIDR match (whitelist hit -> proxy)
  if (RE_IP.test(h)) {
    for (i = 0; i < R.c.length; i++) {
      if (inCidr(h, R.c[i])) return R.p;
    }
    return "DIRECT";
  }

  // exact match (whitelist hit -> proxy)
  if (R.e.indexOf(h) !== -1) return R.p;

  // suffix match: walk host suffixes (whitelist hit -> proxy)
  var parts = h.split(".");
  for (i = 0; i < parts.length - 1; i++) {
    d = parts.slice(i).join(".");
    if (R.s.indexOf(d) !== -1) return R.p;
  }

  // wildcard match (whitelist hit -> proxy)
  for (i = 0; i < R.w.length; i++) {
    if (shExpMatch(h, R.w[i])) return R.p;
  }

  // not in whitelist -> DIRECT
  return "DIRECT";
}
`;

    // 兜底：Chrome 要求 PAC 纯 ASCII，任何非 ASCII（如注释误入）一律剥离，
    // 保证代理应用永不因字符编码失败。规则值已在 ruleset.js 校验为 ASCII，
    // 剥离不会破坏数据。
    const asciiScript = script.replace(/[^\x00-\x7F]/g, "");
    return asciiScript;
  }

  // --- 估算 PAC 大小（字符数），用于容量提示 ---
  function estimateSize(entries) {
    const s = buildPacScript(entries, { scheme: "socks5", host: "127.0.0.1", port: 7897 });
    return s.length;
  }

  const Pac = { buildPacScript, estimateSize };
  global.Pac = Pac;
  if (typeof module !== "undefined" && module.exports) module.exports = Pac;
})(typeof self !== "undefined" ? self : this);
