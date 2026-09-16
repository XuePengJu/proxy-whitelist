// ============================================================
// ProxyMate - Service Worker (Manifest V3)
// 核心逻辑：代理开关、规则集（文件+手动）、PAC 编译、状态同步
// v1.1：从 fixed_servers 升级为 pac_script，规则集统一编译
// ============================================================

importScripts("../utils/ruleset.js", "../utils/pac.js");

const DEFAULTS = {
  enabled: false,
  scheme: "socks5",
  host: "127.0.0.1",
  port: 7897,
  bypassList: ["<local>"],
  // 规则集（v1.1）
  fileRulesEnabled: true,   // 是否启用规则文件（rules/cn-direct.txt）中的规则
  manualRules: []           // 手动输入/文件导入的规则 [{type,value}]
};

// 规则文件地址（扩展内置，无则置空）
const FILE_RULES_URL = chrome.runtime.getURL("rules/cn-direct.txt");

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
// 原「不走代理的域名」条目（bypassList 中非 <local> 项）统一并入 manualRules，
// 之后只有一个数据源，避免两份数据。bypassList 仅保留内置 <local>。

async function migrateLegacyBypass() {
  const settings = await getSettings();
  const legacy = (settings.bypassList || []).filter((b) => b !== "<local>");
  if (!legacy.length) return settings;
  const converted = legacy
    .map((b) => Ruleset.normalizeEntry(b))
    .filter((e) => !!e);
  const merged = Ruleset.dedupe([...(settings.manualRules || []), ...converted]);
  const newSettings = { ...settings, manualRules: merged, bypassList: ["<local>"] };
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

// 合并全部规则：文件规则 + 手动规则 + 内置 <local>（旧白名单已迁移合并）
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
  });
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
    console.warn("[ProxyMate] 图标加载失败，不影响代理功能:", err);
  });
}

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? "#4ade80" : "#9ca3af" });
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
    updateBadge(finalEnabled);
    return { success: false, error };
  }

  await setSettings({ lastError: null });
  updateIcon(enabled);
  updateBadge(enabled);
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
  console.warn("[ProxyMate] 代理错误:", details.error, details.details);
});

console.log(`[ProxyMate] Service Worker 已加载 (v${chrome.runtime.getManifest().version})`);
