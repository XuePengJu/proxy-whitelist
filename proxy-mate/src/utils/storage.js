// ============================================================
// ProxyMate - 存储工具模块
// ============================================================

const DEFAULTS = {
  enabled: false,
  scheme: "socks5",
  host: "127.0.0.1",
  port: 7897,
  bypassList: ["<local>"]
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
