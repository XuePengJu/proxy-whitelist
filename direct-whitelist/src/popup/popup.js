// ============================================================
// ProxyMate - Popup 交互逻辑 (v1.3)
// 精简版：开关 + 配置 + 规则集摘要 + 规则管理页入口
// ============================================================

const els = {
  toggle: document.getElementById("proxy-toggle"),
  statusText: document.getElementById("status-text"),
  scheme: document.getElementById("proxy-scheme"),
  host: document.getElementById("proxy-host"),
  port: document.getElementById("proxy-port"),
  btnSave: document.getElementById("btn-save"),
  // 规则集
  manualCount: document.getElementById("manual-count"),
  btnManage: document.getElementById("btn-manage")
};

let currentSettings = null;

// --- 消息发送 ---

function send(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...data }, (response) => {
      resolve(response || { success: false, error: "无响应" });
    });
  });
}

// --- 初始化 ---

async function init() {
  // 版本号动态取自 manifest，与扩展管理页保持一致
  const manifest = chrome.runtime.getManifest();
  document.getElementById("ext-version").textContent = "v" + manifest.version;

  const res = await send("GET_STATE");
  if (!res.success) return;

  currentSettings = res.settings;
  renderSettings(currentSettings);
  // 规则合计 = 文件规则 + 手动规则
  const total = (res.fileRules || []).length + (currentSettings.manualRules || []).length;
  els.manualCount.textContent = `${total} 条`;
  readProxyState();
}

// --- 读取 Chrome 实际生效的代理状态 ---

function readProxyState() {
  const el = document.getElementById("proxy-state");
  try {
    chrome.proxy.settings.get({}, (d) => {
      el.hidden = true;
      if (chrome.runtime.lastError || !d || !d.value) return;
      const v = d.value;
      const loc = d.levelOfControl || "";

      // 仅在异常/警告状态才显示，正常情况不占空间
      const takenOver = loc === "controlled_by_other_extensions";
      const locked = loc === "not_controllable";
      if (!takenOver && !locked) return;

      let text = "Chrome 实际生效：";
      if (v.mode === "pac_script" && v.pacScript && v.pacScript.data) {
        text += "PAC 已应用（规则命中直连，其余走代理）";
      } else if (v.mode === "fixed_servers") {
        text += "固定代理已应用";
      } else if (v.mode === "direct") {
        text += "直连（未走任何代理）";
      } else if (v.mode === "system") {
        text += "系统代理";
      } else {
        text += v.mode || "未知";
      }
      if (takenOver) text += " ⚠ 被其他扩展接管";
      else if (locked) text += " ⚠ 被系统/管理员控制";
      el.textContent = text;
      el.hidden = false;
    });
  } catch (e) { /* 忽略 */ }
}

function renderSettings(settings) {
  // 开关
  els.toggle.checked = settings.enabled;
  updateStatusText(settings.enabled);

  // 配置
  els.scheme.value = settings.scheme;
  els.host.value = settings.host;
  els.port.value = settings.port;

  // 代理错误提示
  if (settings.lastError) {
    showToast(settings.lastError, 4000);
  }
}

function updateStatusText(enabled) {
  if (enabled) {
    els.statusText.textContent = `代理已连接：${currentSettings.scheme}://${currentSettings.host}:${currentSettings.port}`;
    els.statusText.classList.add("on");
  } else {
    els.statusText.textContent = "代理已关闭";
    els.statusText.classList.remove("on");
  }
}

// --- 规则文件状态渲染已移至规则管理页 ---

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// --- 事件处理 ---

// 开关切换
els.toggle.addEventListener("change", async () => {
  const enabled = els.toggle.checked;
  const res = await send("SET_ENABLED", { enabled });
  if (res.success) {
    currentSettings = { ...currentSettings, enabled: res.enabled };
    updateStatusText(res.enabled);
  } else {
    showToast(res.error || "操作失败");
    els.toggle.checked = !enabled;
  }
});

// 保存配置
els.btnSave.addEventListener("click", async () => {
  const scheme = els.scheme.value;
  const host = els.host.value.trim();
  const port = parseInt(els.port.value, 10);

  if (!host) {
    showToast("地址不能为空");
    return;
  }
  if (!port || port < 1 || port > 65535) {
    showToast("端口范围 1-65535");
    return;
  }

  const res = await send("UPDATE_SETTINGS", { data: { scheme, host, port } });
  if (res.success) {
    currentSettings = res.settings;
    updateStatusText(currentSettings.enabled);
    showToast("配置已保存");
  }
});

// 打开规则管理页
els.btnManage.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/rules/rules.html") });
});

// --- Toast 提示 ---

function showToast(message, duration = 2000) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    color: #fff;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 12px;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
    max-width: 280px;
    text-align: center;
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// --- 启动 ---
init();
