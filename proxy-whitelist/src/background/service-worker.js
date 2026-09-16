// ============================================================
// ClashMate - Service Worker (Manifest V3)
// 核心逻辑：代理开关、规则集（文件+手动）、PAC 编译、状态同步
// v1.1：从 fixed_servers 升级为 pac_script，规则集统一编译
// ============================================================

importScripts("../utils/ruleset.js", "../utils/pac.js");

const DEFAULTS = {
  enabled: false,
  scheme: "socks5",
  host: "127.0.0.1",
  port: 7897,
  bypassList: [],
  // 规则集（v1.1）
  fileRulesEnabled: true,   // 是否启用规则文件（rules/proxy-whitelist.txt）中的规则
  manualRules: []           // 手动输入/文件导入的规则 [{type,value}]
};

// 规则文件地址（扩展内置，无则置空）
const FILE_RULES_URL = chrome.runtime.getURL("rules/proxy-whitelist.txt");

// Chrome proxy 配置长度经验上限（字符），超限时给出提示
const MAX_PAC_CHARS = 100 * 1024;

// --- 存储工具 ---

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULTS, (items) => resolve(items));
  });
}

async function setSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set(settings, resolve);
  });
}

// --- 旧白名单数据迁移（v1.2） ---
// 旧版「不走代理的域名」条目统一并入 manualRules，之后只有一个数据源，避免两份数据。

async function migrateLegacyBypass() {
  const settings = await getSettings();
  const legacy = (settings.bypassList || []).filter((b) => b !== "<local>");
  if (!legacy.length) return settings;
  const converted = legacy
    .map((b) => Ruleset.normalizeEntry(b))
    .filter((e) => !!e);
  const merged = Ruleset.dedupe([...(settings.manualRules || []), ...converted]);
  const newSettings = { ...settings, manualRules: merged, bypassList: [] };
  await setSettings(newSettings);
  return newSettings;
}

// --- 规则文件读取 ---
// 文件不存在 / 读取失败 → 返回空数组（规则集置空），不报错

async function loadFileRules() {
  try {
    const res = await fetch(FILE_RULES_URL);
    if (!res.ok) return [];
    const text = await res.text();
    const { entries } = Ruleset.parseRuleFile(text);
    return entries;
  } catch (e) {
    return [];
  }
}

// 合并全部规则：文件规则 + 手动规则（bypassList 兼容，默认为空）
function collectEntries(settings, fileRules) {
  const entries = [];
  if (settings.fileRulesEnabled) entries.push(...fileRules);
  entries.push(...(settings.manualRules || []));
  for (const b of settings.bypassList || []) {
    if (b === "<local>") {
      entries.push({ type: "local", value: "<local>" });
      continue;
    }
    const e = Ruleset.normalizeEntry(b);
    if (e) entries.push(e);
  }
  return Ruleset.dedupe(entries);
}

// --- 代理配置 ---

function buildProxyConfig(settings, fileRules) {
  const entries = collectEntries(settings, fileRules);
  const script = Pac.buildPacScript(entries, {
    scheme: settings.scheme,
    host: settings.host,
    port: settings.port
  }, { bypass: captureBypass });
  return {
    mode: "pac_script",
    pacScript: { data: script },
    _entries: entries,
    _scriptSize: script.length
  };
}

function buildDirectConfig() {
  return { mode: "direct" };
}

// --- 图标 / Badge 状态 ---

function updateIcon(enabled) {
  const iconPath = enabled ? "icons/icon-on" : "icons/icon-off";
  chrome.action.setIcon({
    path: {
      16: `${iconPath}-16.png`,
      32: `${iconPath}-32.png`
    }
  }).catch((err) => {
    console.warn("[ClashMate] 图标加载失败，不影响代理功能:", err);
  });
}

function updateBadge(state) {
  // state: "ON"（白名单代理已开启）/ "OFF"（关闭）/ "CAP"（抓取中，全局代理）
  const color = state === "CAP" ? "#f59e0b" : state === "ON" ? "#4ade80" : "#9ca3af";
  chrome.action.setBadgeText({ text: state });
  chrome.action.setBadgeBackgroundColor({ color });
}

// --- 核心：应用代理 ---

async function applyProxy(enabled) {
  const settings = await getSettings();
  let config;
  let error = "";

  if (enabled) {
    config = buildProxyConfig(settings, await loadFileRules());
    if (config._scriptSize > MAX_PAC_CHARS) {
      error = `规则集过大（${(config._scriptSize / 1024).toFixed(0)}KB），超过 Chrome 限制（约100KB），请精简规则`;
    }
  } else {
    config = buildDirectConfig();
  }

  if (!error) {
    try {
      await new Promise((resolve, reject) => {
        const clean = { mode: config.mode };
        if (config.mode === "pac_script") clean.pacScript = config.pacScript;
        chrome.proxy.settings.set({ value: clean, scope: "regular" }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
    } catch (e) {
      error = `应用代理失败: ${e.message}`;
    }
  }

  // 应用失败：回滚启用状态，保证开关与真实生效状态一致
  if (error) {
    const finalEnabled = enabled ? false : enabled;
    await setSettings({ enabled: finalEnabled, lastError: error });
    updateIcon(finalEnabled);
    updateBadge(captureBypass ? "CAP" : finalEnabled ? "ON" : "OFF");
    return { success: false, error };
  }

  await setSettings({ lastError: null });
  updateIcon(enabled);
  updateBadge(captureBypass ? "CAP" : enabled ? "ON" : "OFF");
  return { success: true, error: "" };
}

// --- 初始化：启动时恢复状态 ---

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await applyProxy(settings.enabled);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await setSettings(DEFAULTS);
    await applyProxy(false);
  } else if (details.reason === "update") {
    await migrateLegacyBypass();
    const settings = await getSettings();
    await applyProxy(settings.enabled);
  }
});

// --- 页面域名抓取（v1.1） ---
// 交互：popup 点「抓取本页接口域名」→ 记录目标 tab 并刷新页面 →
// 收集该 tab 刷新后的 http(s) 请求域名（仅本地统计，不上传）→ 管理页展示并一键加入白名单

const DOMAIN_WINDOW_MS = 60 * 1000;
const DOMAIN_PERSIST_MS = 4000;
let domainStats = new Map(); // tabId -> Map(host -> {count, ts})
let lastDomainPersist = 0;
let capture = null; // { tabId, startTs }
let captureBypass = false; // 抓取期间：所有流量临时走代理（全局代理标识）

// --- 页面悬浮标：抓取期间在目标页面显示全局代理倒计时（v1.2） ---

async function injectCaptureBanner(tabId, seconds) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (secs) => {
        const id = "clashmate-capture-banner";
        const old = document.getElementById(id);
        if (old) old.remove();
        const el = document.createElement("div");
        el.id = id;
        el.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;background:rgba(245,158,11,.96);color:#fff;font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:8px 14px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.3);pointer-events:none;";
        const txt = (l) => "\u{1F50D} ClashMate \u62D3\u53D6\u4E2D \u00B7 \u5168\u5C40\u4EE3\u7406\uFF08\u5269 " + l + "s\uFF09";
        el.textContent = txt(Math.max(1, secs));
        (document.body || document.documentElement).appendChild(el);
        let left = Math.max(1, secs);
        const timer = setInterval(() => {
          left--;
          if (left <= 0) {
            clearInterval(timer);
            if (el.parentNode) el.parentNode.removeChild(el);
          } else {
            el.textContent = txt(left);
          }
        }, 1000);
      },
      args: [Math.max(1, seconds)]
    });
  } catch (e) { /* 某些页面无法注入（chrome:// 等），忽略 */ }
}

// 刷新/新建页面后页面环境会重置，需在页面加载完成后注入浮标
function scheduleBannerOnLoad(tabId, seconds) {
  const deadline = Date.now() + seconds * 1000;
  const listener = (tid, info) => {
    if (tid !== tabId || info.status !== "complete") return;
    chrome.tabs.onUpdated.removeListener(listener);
    const remain = Math.max(1, Math.round((deadline - Date.now()) / 1000));
    injectCaptureBanner(tabId, remain);
  };
  chrome.tabs.onUpdated.addListener(listener);
  setTimeout(() => chrome.tabs.onUpdated.removeListener(listener), (seconds + 3) * 1000);
  // 兜底：页面可能已完成加载，稍后直接注入一次
  setTimeout(() => {
    injectCaptureBanner(tabId, Math.max(1, Math.round((deadline - Date.now()) / 1000)));
  }, 400);
}

function persistDomains() {
  const snapshot = {};
  for (const [tabId, perTab] of domainStats) {
    const hosts = {};
    for (const [host, rec] of perTab) hosts[host] = { count: rec.count, ts: rec.ts };
    snapshot[tabId] = hosts;
  }
  chrome.storage.session.set({ domainSnapshot: snapshot }).catch(() => {});
}

function recordDomain(details) {
  try {
    let url;
    try { url = new URL(details.url); } catch (e) { return; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".")) return;               // localhost / 单段主机名
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return; // IP 字面量不收集
    const now = Date.now();
    let perTab = domainStats.get(details.tabId);
    if (!perTab) { perTab = new Map(); domainStats.set(details.tabId, perTab); }
    const rec = perTab.get(host);
    if (rec) { rec.count++; rec.ts = now; }
    else perTab.set(host, { count: 1, ts: now });
    if (now - lastDomainPersist > DOMAIN_PERSIST_MS) {
      lastDomainPersist = now;
      persistDomains();
    }
  } catch (e) { /* 忽略 */ }
}

function cleanDomains(now) {
  const cutoff = now - DOMAIN_WINDOW_MS;
  for (const [tabId, perTab] of domainStats) {
    for (const [host, rec] of perTab) if (rec.ts < cutoff) perTab.delete(host);
    if (perTab.size === 0) domainStats.delete(tabId);
  }
}

async function loadCapture() {
  if (!capture) {
    try {
      const sess = await chrome.storage.session.get("capture");
      capture = sess.capture || null;
    } catch (e) { capture = null; }
  }
  return capture;
}

async function getDomainsForTab(tabId, startTs) {
  // 内存 + session 快照合并，返回该 tab 从 startTs 起请求过的域名
  const merged = new Map();
  try {
    const sess = await chrome.storage.session.get("domainSnapshot");
    const snap = sess.domainSnapshot || {};
    const hosts = snap[tabId] || {};
    for (const host in hosts) merged.set(host, hosts[host]);
  } catch (e) { /* 忽略 */ }
  const perTab = domainStats.get(tabId);
  if (perTab) {
    for (const [host, rec] of perTab) {
      const cur = merged.get(host);
      if (cur) {
        cur.count = Math.max(cur.count, rec.count);
        cur.ts = Math.max(cur.ts, rec.ts);
      } else {
        merged.set(host, { count: rec.count, ts: rec.ts });
      }
    }
  }
  const list = [];
  for (const [host, rec] of merged) {
    if (rec.ts < startTs) continue;
    list.push({ host, count: rec.count });
  }
  list.sort((a, b) => b.count - a.count);
  return list;
}

// 抓取结算：把该 tab 自刷新以来抓到的域名全部加入白名单（自动去重），并恢复白名单模式
async function finalizeCapture() {
  const cap = await loadCapture();
  if (!cap || cap.status !== "capturing") return;
  const domains = await getDomainsForTab(cap.tabId, cap.startTs);
  let added = 0;
  if (domains.length) {
    const entries = Ruleset.parseText(domains.map((d) => d.host).join("\n"));
    if (entries.length) {
      const settings0 = await getSettings();
      const before = settings0.manualRules || [];
      const merged = Ruleset.dedupe([...entries, ...before]);
      added = merged.length - before.length;
      if (added > 0) await setSettings({ ...settings0, manualRules: merged });
    }
  }
  cap.status = "done";
  cap.added = added;
  cap.domains = domains.map((d) => d.host);
  capture = cap;
  chrome.storage.session.set({ capture }).catch(() => {});
  // 恢复原代理状态：白名单模式（新域名已并入 manualRules）或直连（用户原本关闭）
  // 页面悬浮标自带 10 秒倒计时，到时自动消失
  captureBypass = false;
  const settings = await getSettings();
  if (settings.enabled) {
    await applyProxy(true);
  } else {
    await applyProxy(false);
  }
  updateBadge(settings.enabled ? "ON" : "OFF");
}

chrome.webRequest.onBeforeRequest.addListener(recordDomain, {
  urls: ["http://*/*", "https://*/*"]
});

// --- 消息处理（Popup <-> Service Worker） ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    switch (message.type) {
      case "GET_STATE": {
        // 迁移旧白名单数据（一次性）
        await migrateLegacyBypass();
        const settings = await getSettings();
        // 每次读取规则文件，若内容变化则自动重建生效（改文件后重开 Popup 即生效）
        const fileRules = await loadFileRules();
        const fileKey = JSON.stringify(fileRules);
        if (settings.fileRulesKey !== fileKey && settings.enabled) {
          await applyProxy(true);
        }
        await setSettings({ fileRulesKey: fileKey });
        const latest = await getSettings();
        return { success: true, settings: latest, fileRules };
      }

      case "TOGGLE_PROXY": {
        const settings = await getSettings();
        const newEnabled = !settings.enabled;
        await setSettings({ ...settings, enabled: newEnabled });
        const r = await applyProxy(newEnabled);
        return { success: r.success, enabled: newEnabled, error: r.error };
      }

      case "SET_ENABLED": {
        const settings = await getSettings();
        const newEnabled = message.enabled;
        await setSettings({ ...settings, enabled: newEnabled });
        const r = await applyProxy(newEnabled);
        return { success: r.success, enabled: newEnabled, error: r.error };
      }

      case "UPDATE_SETTINGS": {
        const settings = await getSettings();
        const newSettings = { ...settings, ...message.data };
        await setSettings(newSettings);
        if (newSettings.enabled) {
          const r = await applyProxy(true);
          return { success: r.success, settings: newSettings, error: r.error };
        }
        return { success: true, settings: newSettings };
      }

      // --- 规则集（v1.1+） ---
      case "ADD_RULES": {
        // 输入框多行添加
        const settings = await getSettings();
        const entries = Ruleset.parseText(message.text);
        if (!entries.length) return { success: false, error: "没有有效的规则" };
        const merged = Ruleset.dedupe([...entries, ...(settings.manualRules || [])]);
        await setSettings({ ...settings, manualRules: merged });
        if (settings.enabled) await applyProxy(true);
        return { success: true, manualRules: merged };
      }

      case "REMOVE_RULE": {
        const settings = await getSettings();
        const merged = (settings.manualRules || []).filter(
          (e) => !(e.type === message.ruleType && e.value === message.value)
        );
        await setSettings({ ...settings, manualRules: merged });
        if (settings.enabled) await applyProxy(true);
        return { success: true, manualRules: merged };
      }

      case "TOGGLE_FILE_RULES": {
        const settings = await getSettings();
        const newVal = message.enabled;
        await setSettings({ ...settings, fileRulesEnabled: newVal });
        if (settings.enabled) await applyProxy(true);
        return { success: true, fileRulesEnabled: newVal };
      }

      case "IMPORT_RULES": {
        // 文件导入：自动识别格式（txt / clash-yaml / clash-list / json）
        const settings = await getSettings();
        const { format, entries } = Ruleset.parseRuleFile(message.text);
        if (!entries.length) return { success: false, error: "文件未识别到有效规则" };
        const stats = Ruleset.mergeStats(entries, settings.manualRules || []);
        const merged = Ruleset.dedupe([...entries, ...(settings.manualRules || [])]);
        await setSettings({ ...settings, manualRules: merged });
        if (settings.enabled) await applyProxy(true);
        return { success: true, format, stats, manualRules: merged };
      }

      case "START_CAPTURE": {
        // popup 触发抓取：输入网址 → 打开新标签页抓取；留空 → 抓当前页面（popup 传入 tabId）
        // 关键：先开启全局代理（10 秒内所有流量走代理），再加载/刷新页面，
        // 保证目标网站即使不在白名单也能完整打开，从而抓到全部接口域名
        let tab = null;
        if (message.url) {
          let url = String(message.url).trim();
          if (!/^https?:\/\//i.test(url)) url = "https://" + url;
          try { tab = await chrome.tabs.create({ url, active: true }); } catch (e) { tab = null; }
          if (!tab || !tab.id) return { success: false, error: "无法打开该网址，请检查输入" };
        } else if (message.tabId) {
          try { tab = await chrome.tabs.get(message.tabId); } catch (e) { tab = null; }
          if (!tab || !tab.id) return { success: false, error: "标签页不存在或已关闭" };
        } else {
          return { success: false, error: "缺少标签页信息" };
        }

        // 1) 开启全局代理（抓取期间所有流量走代理）
        captureBypass = true;
        const ar = await applyProxy(true);
        if (!ar.success) {
          captureBypass = false;
          return { success: false, error: ar.error || "开启全局代理失败，无法抓取" };
        }

        // 2) 清空该 tab 的历史统计，只统计本次的请求
        domainStats.delete(tab.id);
        capture = { tabId: tab.id, startTs: Date.now(), status: "capturing", added: 0, domains: [] };
        chrome.storage.session.set({ capture }).catch(() => {});

        // 3) 当前页面 → 显式刷新（此时已是全局代理）；新标签页 → 重载一次确保全部请求走代理
        try { await chrome.tabs.reload(tab.id); } catch (e) { /* 忽略 */ }

        // 4) 标识：badge 变橙色 CAP + 页面悬浮标（页面加载完成后注入，10 秒倒计时）
        updateBadge("CAP");
        scheduleBannerOnLoad(tab.id, 10);

        // 5) 10 秒后自动结算并加入白名单（SW 空闲阈值 30 秒，10 秒内安全）
        setTimeout(finalizeCapture, 10000);
        return { success: true, tabId: tab.id, tabUrl: tab.url || "" };
      }

      case "GET_CAPTURE": {
        // popup 查询：返回抓取会话状态；若超时未结算（SW 曾休眠）则兜底结算
        const cap = await loadCapture();
        if (!cap) return { success: true, capture: null, domains: [], elapsed: 0 };
        const elapsed = Date.now() - cap.startTs;
        if (cap.status === "capturing" && elapsed >= 10000) {
          await finalizeCapture();
        }
        cleanDomains(Date.now());
        const domains = cap.status === "capturing"
          ? await getDomainsForTab(cap.tabId, cap.startTs)
          : cap.domains.map((h) => ({ host: h, count: 0 }));
        return { success: true, capture: cap, domains, elapsed };
      }

      default:
        return { success: false, error: "未知消息类型" };
    }
  };

  handle().then(sendResponse).catch((err) => {
    sendResponse({ success: false, error: err.message });
  });

  return true; // 异步响应
});

// --- 代理错误监听 ---

chrome.proxy.onProxyError.addListener((details) => {
  console.warn("[ClashMate] 代理错误:", details.error, details.details);
});

// --- SW 唤醒兜底（v1.2） ---
// 若 SW 在抓取期间被休眠重启，内存中的 capture/timer 会丢失。
// 唤醒时检测到未结算的抓取会话，立即结算并恢复白名单模式，避免全局代理卡住。
(async () => {
  try {
    const sess = await chrome.storage.session.get("capture");
    if (sess.capture && sess.capture.status === "capturing") {
      capture = sess.capture;
      await finalizeCapture();
    }
  } catch (e) { /* 忽略 */ }
})();

console.log(`[ClashMate] Service Worker 已加载 (v${chrome.runtime.getManifest().version})`);
