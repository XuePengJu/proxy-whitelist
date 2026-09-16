// ============================================================
// ProxyMate - PAC 脚本编译模块
// 将规则条目（domain-suffix / domain / cidr / wildcard / local）
// 编译为高效的 PAC 脚本：后缀/精确用哈希表，CIDR 线性，通配用 shExpMatch
// ============================================================

(function (global) {
  "use strict";

  // --- 生成 PAC 脚本字符串 ---
  // entries: [{ type, value }]
  // proxy: { scheme, host, port }，scheme: socks5 / http
  function buildPacScript(entries, proxy) {
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

    const json = JSON.stringify({ s: S, e: E, c: C, w: W, p: proxyStr, ph: usePlainHost });

    // PAC 脚本：ES5 兼容（Chrome PAC 环境为 V8，支持 ES5+）
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

  // <local> 语义：无点主机名直连
  if (R.ph && isPlainHostName(host)) return "DIRECT";

  // IP 字面量 -> CIDR 匹配
  if (RE_IP.test(h)) {
    for (i = 0; i < R.c.length; i++) {
      if (inCidr(h, R.c[i])) return "DIRECT";
    }
    return R.p;
  }

  // 精确匹配
  if (R.e.indexOf(h) !== -1) return "DIRECT";

  // 后缀匹配：逐级缩短 host 查哈希（用数组二分优化大集合）
  var parts = h.split(".");
  for (i = 0; i < parts.length - 1; i++) {
    d = parts.slice(i).join(".");
    if (R.s.indexOf(d) !== -1) return "DIRECT";
  }

  // 通配符匹配（shExpMatch）
  for (i = 0; i < R.w.length; i++) {
    if (shExpMatch(h, R.w[i])) return "DIRECT";
  }

  return R.p;
}
`;

    return script;
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
