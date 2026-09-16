// ============================================================
// ProxyMate - Popup 交互逻辑
// ============================================================

const els = {
  toggle: document.getElementById("proxy-toggle"),
  statusText: document.getElementById("status-text"),
  scheme: document.getElementById("proxy-scheme"),
  host: document.getElementById("proxy-host"),
  port: document.getElementById("proxy-port"),
  btnSave: document.getElementById("btn-save"),
  bypassInput: document.getElementById("bypass-input"),
  btnAdd: document.getElementById("btn-add"),
  bypassList: document.getElementById("bypass-list")
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
  const res = await send("GET_STATE");
  if (!res.success) return;

  currentSettings = res.settings;
  renderSettings(currentSettings);
}

function renderSettings(settings) {
  // 开关
  els.toggle.checked = settings.enabled;
  updateStatusText(settings.enabled);

  // 配置
  els.scheme.value = settings.scheme;
  els.host.value = settings.host;
  els.port.value = settings.port;

  // 白名单
  renderBypassList(settings.bypassList);
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

// --- 白名单渲染 ---

function renderBypassList(list) {
  els.bypassList.innerHTML = "";

  if (!list || list.length === 0) {
    els.bypassList.innerHTML = `<div class="bypass-empty">暂无白名单域名</div>`;
    return;
  }

  for (const domain of list) {
    const tag = document.createElement("div");
    tag.className = "bypass-tag";
    tag.innerHTML = `
      <span>${escapeHtml(domain)}</span>
      <button class="remove" title="删除" data-domain="${escapeHtml(domain)}">&times;</button>
    `;
    tag.querySelector(".remove").addEventListener("click", () => removeBypass(domain));
    els.bypassList.appendChild(tag);
  }
}

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

// 添加白名单
async function addBypass() {
  const raw = els.bypassInput.value.trim();
  if (!raw) return;

  const res = await send("ADD_BYPASS", { domain: raw });
  if (res.success) {
    els.bypassInput.value = "";
    currentSettings = { ...currentSettings, bypassList: res.bypassList };
    renderBypassList(res.bypassList);
  } else {
    showToast(res.error || "添加失败");
  }
}

els.btnAdd.addEventListener("click", addBypass);
els.bypassInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBypass();
});

// 删除白名单
async function removeBypass(domain) {
  const res = await send("REMOVE_BYPASS", { domain });
  if (res.success) {
    currentSettings = { ...currentSettings, bypassList: res.bypassList };
    renderBypassList(res.bypassList);
  }
}

// --- Toast 提示 ---

function showToast(message) {
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
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// --- 启动 ---
init();
