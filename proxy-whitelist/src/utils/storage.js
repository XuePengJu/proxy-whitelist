// ============================================================
// ClashMate - 存储工具模块
// ============================================================

const DEFAULTS = {
  enabled: false,
  scheme: "socks5",
  host: "127.0.0.1",
  port: 7897,
  bypassList: [],
  // 规则集（v1.1）
  fileRulesEnabled: true,   // 是否启用规则文件（rules/proxy-whitelist.txt）中的规则
  manualRules: [],          // 手动输入/文件导入的规则条目 [{type,value}]
  fileRulesKey: "",         // 规则文件内容指纹（用于检测文件变化）
  lastError: null           // 最近一次代理错误（Popup 展示）
};

export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULTS, (items) => resolve(items));
  });
}

export async function setSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set(settings, resolve);
  });
}

export async function resetSettings() {
  await setSettings(DEFAULTS);
  return DEFAULTS;
}
