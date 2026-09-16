// ============================================================
// ProxyMate - Service Worker (Manifest V3)
// 核心逻辑：代理开关、白名单管理、状态同步
// ============================================================

const DEFAULTS = {
  enabled: false,
  scheme: "socks5",
  host: "127.0.0.1",
  port: 7897,
  bypassList: ["<local>"]
};

// --- 存储工具 ---

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULTS, (items) => {
      resolve(items);
    });
  });
}

async function setSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set(settings, resolve);
  });
}

// --- 代理配置 ---

function buildProxyConfig(settings) {
  const { scheme, host, port, bypassList } = settings;
  const proxyServer = { scheme, host, port };
  return {
    mode: "fixed_servers",
    rules: {
      proxyForHttp: proxyServer,
      proxyForHttps: proxyServer,
      fallbackProxy: proxyServer,
      bypassList: [...bypassList]
    }
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
  const config = enabled ? buildProxyConfig(settings) : buildDirectConfig();

  await new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });

  updateIcon(enabled);
  updateBadge(enabled);
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
    const settings = await getSettings();
    await applyProxy(settings.enabled);
  }
});

// --- 消息处理（Popup <-> Service Worker）---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    switch (message.type) {
      case "GET_STATE": {
        const settings = await getSettings();
        return { success: true, settings };
      }

      case "TOGGLE_PROXY": {
        const settings = await getSettings();
        const newEnabled = !settings.enabled;
        await setSettings({ ...settings, enabled: newEnabled });
        await applyProxy(newEnabled);
        return { success: true, enabled: newEnabled };
      }

      case "SET_ENABLED": {
        const settings = await getSettings();
        const newEnabled = message.enabled;
        await setSettings({ ...settings, enabled: newEnabled });
        await applyProxy(newEnabled);
        return { success: true, enabled: newEnabled };
      }

      case "UPDATE_SETTINGS": {
        const settings = await getSettings();
        const newSettings = { ...settings, ...message.data };
        await setSettings(newSettings);
        if (newSettings.enabled) {
          await applyProxy(true);
        }
        return { success: true, settings: newSettings };
      }

      case "ADD_BYPASS": {
        const settings = await getSettings();
        const domain = normalizeDomain(message.domain);
        if (!domain || settings.bypassList.includes(domain)) {
          return { success: false, error: "域名已存在或格式无效" };
        }
        const newBypassList = [...settings.bypassList, domain];
        await setSettings({ ...settings, bypassList: newBypassList });
        if (settings.enabled) await applyProxy(true);
        return { success: true, bypassList: newBypassList };
      }

      case "REMOVE_BYPASS": {
        const settings = await getSettings();
        const newBypassList = settings.bypassList.filter(d => d !== message.domain);
        await setSettings({ ...settings, bypassList: newBypassList });
        if (settings.enabled) await applyProxy(true);
        return { success: true, bypassList: newBypassList };
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

// --- 工具函数 ---

function normalizeDomain(raw) {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  // 自动将 .example.com 转为 *.example.com
  if (trimmed.startsWith(".") && !trimmed.startsWith("*")) {
    return "*" + trimmed;
  }
  return trimmed;
}

// --- 代理错误监听 ---

chrome.proxy.onProxyError.addListener((details) => {
  console.warn("[ProxyMate] 代理错误:", details.error, details.details);
});

console.log("[ProxyMate] Service Worker 已加载");
