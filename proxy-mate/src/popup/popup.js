// ============================================================
// ProxyMate - Popup 交互逻辑 (v1.1)
// 新增：规则集（文件+手动）、文件导入
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
  bypassList: document.getElementById("bypass-list"),
  // 规则集
  fileRuleCard: document.getElementById("file-rule-card"),
  fileRuleMeta: document.getElementById("file-rule-meta"),
  fileRuleHint: document.getElementById("file-rule-hint"),
  fileRulesToggle: document.getElementById("file-rules-toggle"),
  rulesInput: document.getElementById("rules-input"),
  btnAddRules: document.getElementById("btn-add-rules"),
  btnImport: document.getElementById("btn-import"),
  fileInput: document.getElementById("file-input"),
  manualList: document.getElementById("manual-list"),
  manualCount: document.getElementById("manual-count")
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

  // 白名单
  renderBypassList(settings.bypassList);

  // 规则集开关
  els.fileRulesToggle.checked = settings.fileRulesEnabled !== false;
  renderManualList(settings.manualRules || []);

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

// --- 规则文件渲染 ---

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

// --- 手动规则渲染 ---

function renderManualList(list) {
  els.manualList.innerHTML = "";
  els.manualCount.textContent = `${list.length} 条`;

  if (!list || list.length === 0) {
    els.manualList.innerHTML = `<div class="bypass-empty">暂无手动规则</div>`;
    return;
  }

  for (const rule of list) {
    const tag = document.createElement("div");
    tag.className = "bypass-tag rules-tag";
    const label = rule.type === "domain" ? "=" + rule.value : rule.value;
    tag.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <button class="remove" title="删除">&times;</button>
    `;
    tag.querySelector(".remove").addEventListener("click", () => removeRule(rule));
    els.manualList.appendChild(tag);
  }
}

// --- 白名单渲染（原有） ---

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

// 添加白名单（原有）
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

// --- 规则集事件 ---

// 添加手动规则（多行）
async function addRules() {
  const text = els.rulesInput.value.trim();
  if (!text) {
    showToast("请先输入规则");
    return;
  }
  const res = await send("ADD_RULES", { text });
  if (res.success) {
    els.rulesInput.value = "";
    currentSettings = { ...currentSettings, manualRules: res.manualRules };
    renderManualList(res.manualRules);
    showToast("已添加到规则集");
  } else {
    showToast(res.error || "添加失败");
  }
}

els.btnAddRules.addEventListener("click", addRules);
els.rulesInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addRules();
});

// 删除手动规则
async function removeRule(rule) {
  const res = await send("REMOVE_RULE", { type: rule.type, value: rule.value });
  if (res.success) {
    currentSettings = { ...currentSettings, manualRules: res.manualRules };
    renderManualList(res.manualRules);
  }
}

// 文件规则开关
els.fileRulesToggle.addEventListener("change", async () => {
  const enabled = els.fileRulesToggle.checked;
  const res = await send("TOGGLE_FILE_RULES", { enabled });
  if (res.success) {
    currentSettings = { ...currentSettings, fileRulesEnabled: res.fileRulesEnabled };
    // 重新读取文件状态渲染
    const st = await send("GET_STATE");
    if (st.success) {
      currentSettings = { ...currentSettings, ...st.settings, manualRules: currentSettings.manualRules };
      renderFileRules(st.fileRules || []);
    } else {
      renderFileRules([]);
    }
    showToast(res.fileRulesEnabled ? "规则文件已启用" : "规则文件已停用");
  } else {
    els.fileRulesToggle.checked = !enabled;
  }
});

// 导入文件
els.btnImport.addEventListener("click", () => els.fileInput.click());

els.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const text = ev.target.result;
    const res = await send("IMPORT_RULES", { text });
    if (res.success) {
      currentSettings = { ...currentSettings, manualRules: res.manualRules };
      renderManualList(res.manualRules);
      const st = res.stats || {};
      showToast(
        `已导入 ${file.name}（${res.format}）：新增 ${st.added} 条，重复 ${st.duplicate} 条，无效 ${st.skipped} 条`
      );
    } else {
      showToast(res.error || "导入失败");
    }
    els.fileInput.value = "";
  };
  reader.onerror = () => {
    showToast("文件读取失败");
    els.fileInput.value = "";
  };
  reader.readAsText(file, "utf-8");
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
