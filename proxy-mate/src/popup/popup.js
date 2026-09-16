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
  fileRuleMeta: document.getElementById("file-rule-meta"),
  fileRuleHint: document.getElementById("file-rule-hint"),
  fileRulesToggle: document.getElementById("file-rules-toggle"),
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
  const res = await send("GET_STATE");
  if (!res.success) return;

  currentSettings = res.settings;
  renderSettings(currentSettings);
  renderFileRules(res.fileRules || []);
}

function renderSettings(settings) {
  // 开关
  els.toggle.checked = settings.enabled;
  updateStatusText(settings.enabled);

  // 配置
  els.scheme.value = settings.scheme;
  els.host.value = settings.host;
  els.port.value = settings.port;

  // 规则集开关与手动规则条数
  els.fileRulesToggle.checked = settings.fileRulesEnabled !== false;
  els.manualCount.textContent = `${(settings.manualRules || []).length} 条`;

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

// --- 规则文件状态渲染 ---

function renderFileRules(fileRules) {
  const meta = els.fileRuleMeta;
  const hint = els.fileRuleHint;

  if (currentSettings.fileRulesEnabled === false) {
    meta.textContent = "已停用（可在下方重新开启）";
    meta.className = "file-rule-meta warn";
    return;
  }

  if (!fileRules || fileRules.length === 0) {
    meta.textContent = "未找到规则或文件为空（规则集已置空）";
    meta.className = "file-rule-meta warn";
    hint.textContent = "编辑 proxy-mate/rules/cn-direct.txt 后重开本弹窗即生效";
    return;
  }

  meta.textContent = `${fileRules.length} 条规则已加载 · 命中即直连不走代理`;
  meta.className = "file-rule-meta ok";
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

// 文件规则开关
els.fileRulesToggle.addEventListener("change", async () => {
  const enabled = els.fileRulesToggle.checked;
  const res = await send("TOGGLE_FILE_RULES", { enabled });
  if (res.success) {
    currentSettings = { ...currentSettings, fileRulesEnabled: res.fileRulesEnabled };
    const st = await send("GET_STATE");
    if (st.success) {
      currentSettings = st.settings;
      renderFileRules(st.fileRules || []);
    } else {
      renderFileRules([]);
    }
    showToast(res.fileRulesEnabled ? "规则文件已启用" : "规则文件已停用");
  } else {
    els.fileRulesToggle.checked = !enabled;
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
