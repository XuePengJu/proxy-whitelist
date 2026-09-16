// ============================================================
// ClashMate - 规则集解析与校验模块
// 支持：纯文本（每行一条）/ Clash RuleSet YAML / Clash List
// 规则类型：domain-suffix（后缀）/ domain（精确）/ cidr（IP段）/ wildcard（通配）
// ============================================================

(function (global) {
  "use strict";

  // --- 单条规则规范化 ---
  // 输入原始字符串，输出 { type, value } 或 null（无效）
  // 支持写法：
  //   baidu.com        -> domain-suffix（含所有子域）
  //   =example.com     -> domain（仅本域，不含子域）
  //   *.baidu.com      -> wildcard（通配，转 shExpMatch）
  //   223.5.5.0/24     -> cidr
  //   114.114.114.114  -> cidr (/32)
  function normalizeEntry(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return null;

    // 精确匹配：=example.com
    if (s.startsWith("=")) {
      const v = s.slice(1).trim();
      if (isDomain(v)) return { type: "domain", value: v };
      return null;
    }

    // 通配：*.baidu.com（保留 * 模式交给 PAC shExpMatch）
    if (s.includes("*")) {
      if (/^[*][.][a-z0-9.-]+$/.test(s) || /^[a-z0-9.*-]+$/.test(s)) {
        return { type: "wildcard", value: s };
      }
      return null;
    }

    // CIDR
    if (/^\d+\.\d+\.\d+\.\d+\/\d{1,2}$/.test(s)) {
      const [, bits] = s.split("/");
      if (parseInt(bits, 10) >= 0 && parseInt(bits, 10) <= 32) {
        return { type: "cidr", value: s };
      }
      return null;
    }

    // 单 IP -> /32
    if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) {
      return { type: "cidr", value: s + "/32" };
    }

    // IPv6 CIDR（简化支持）
    if (/^[0-9a-f:]+::\/\d{1,3}$/.test(s) || /^\[[0-9a-f:]+\]\/\d{1,3}$/.test(s)) {
      return { type: "cidr", value: s.replace(/^\[|\]$/g, "") };
    }

    // 纯域名 -> 后缀匹配
    if (isDomain(s)) {
      return { type: "domain-suffix", value: s };
    }

    return null;
  }

  function isDomain(s) {
    // 简单域名校验：字母数字、连字符、点，长度限制
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) && s.length <= 253;
  }

  // --- 解析纯文本（每行一条） ---
  // 支持 # 注释、空行、逗号/空格分隔的多条目行
  function parseText(text) {
    const lines = String(text || "").split(/\r?\n/);
    const entries = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      // 兼容 "DOMAIN-SUFFIX,baidu.com" 单行（Clash list 混入纯文本）
      const clash = parseClashLine(trimmed);
      if (clash) {
        entries.push(clash);
        continue;
      }
      const e = normalizeEntry(trimmed);
      if (e) entries.push(e);
    }
    return entries;
  }

  // --- Clash 单行规则解析 ---
  // DOMAIN-SUFFIX,baidu.com | DOMAIN,example.com | IP-CIDR,1.2.3.0/24,no-resolve
  function parseClashLine(line) {
    const m = /^(DOMAIN-SUFFIX|DOMAIN|DOMAIN-KEYWORD|IP-CIDR|IP-CIDR6)\s*,\s*(.+)$/i.exec(line);
    if (!m) return null;
    const type = m[1].toUpperCase();
    const value = m[2].split(",")[0].trim().toLowerCase();
    switch (type) {
      case "DOMAIN-SUFFIX":
        return normalizeEntry(value); // 后缀
      case "DOMAIN":
        return normalizeEntry("=" + value); // 精确
      case "DOMAIN-KEYWORD":
        // PAC 要求 ASCII，中文关键词规则直接拒绝（避免污染 PAC 脚本）
        if (!/^[\x00-\x7F]+$/.test(value)) return null;
        return { type: "wildcard", value: "*" + value + "*" };
      case "IP-CIDR":
      case "IP-CIDR6":
        return normalizeEntry(value); // CIDR（含 /32）
      default:
        return null;
    }
  }

  // --- 解析 Clash RuleSet YAML ---
  // payload:
  //   - 'DOMAIN-SUFFIX,baidu.com'
  function parseClashYaml(text) {
    const entries = [];
    const lines = String(text || "").split(/\r?\n/);
    let inPayload = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "payload:" || trimmed === "payload: |" || trimmed === "payload: |-") {
        inPayload = true;
        continue;
      }
      if (!inPayload) continue;
      if (!trimmed.startsWith("-")) continue; // 只取 payload 下的条目行
      let item = trimmed.replace(/^-\s*/, "");
      // 去掉引号
      item = item.replace(/^['"]|['"]$/g, "");
      const e = parseClashLine(item);
      if (e) entries.push(e);
    }
    return entries;
  }

  // --- 自动识别并解析文件内容 ---
  // 返回 { format, entries }
  // 支持格式：text / clash-yaml / clash-list / json
  function parseRuleFile(text) {
    const t = String(text || "");
    const firstLine = t.split(/\r?\n/).find((l) => l.trim() !== "");

    // JSON 文件：{"rules": [...]} 或 ["a.com", ...]
    if (t.trim().startsWith("{")) {
      try {
        const obj = JSON.parse(t);
        const list = Array.isArray(obj) ? obj : obj.rules;
        if (Array.isArray(list)) {
          const entries = [];
          for (const item of list) {
            if (typeof item === "string") {
              const e = normalizeEntry(item);
              if (e) entries.push(e);
            } else if (item && typeof item === "object" && item.value) {
              const e = normalizeEntry(item.type === "domain" ? "=" + item.value : item.value);
              if (e) entries.push(e);
            }
          }
          return { format: "json", entries };
        }
      } catch (e) { /* 非 JSON 则继续 */ }
    }

    // Clash YAML：首行为 payload:
    if (firstLine && /^payload\s*:/.test(firstLine)) {
      return { format: "clash-yaml", entries: parseClashYaml(t) };
    }

    // Clash List / 混合：逐行判断
    const entries = [];
    let clashCount = 0;
    for (const line of t.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const clash = parseClashLine(trimmed);
      if (clash) { entries.push(clash); clashCount++; }
      else {
        const e = normalizeEntry(trimmed);
        if (e) entries.push(e);
      }
    }
    const format = clashCount > 0 && clashCount >= entries.length * 0.5 ? "clash-list" : "text";
    return { format, entries };
  }

  // --- 去重（按 type+value） ---
  function dedupe(entries) {
    const seen = {};
    const out = [];
    for (const e of entries) {
      if (!e) continue;
      const key = e.type + "|" + e.value;
      if (!seen[key]) {
        seen[key] = true;
        out.push(e);
      }
    }
    return out;
  }

  // --- 差异统计（对比已有条目） ---
  // 返回 { valid, duplicate, skipped, added }
  function mergeStats(newEntries, existingEntries) {
    const exist = {};
    for (const e of existingEntries) {
      exist[e.type + "|" + e.value] = true;
    }
    let duplicate = 0, added = 0;
    for (const e of newEntries) {
      if (exist[e.type + "|" + e.value]) duplicate++;
      else added++;
    }
    return { valid: newEntries.length, duplicate, skipped: 0, added };
  }

  const Ruleset = {
    normalizeEntry,
    parseText,
    parseClashLine,
    parseClashYaml,
    parseRuleFile,
    dedupe,
    mergeStats
  };

  global.Ruleset = Ruleset;
  if (typeof module !== "undefined" && module.exports) module.exports = Ruleset;
})(typeof self !== "undefined" ? self : this);
