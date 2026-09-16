// ============================================================
// ClashMate - Popup 交互逻辑 (v1.1)
// 极简：开关 + 代理配置（协议/地址/端口） + 代理白名单入口
// ============================================================

const els = {
  toggle: document.getElementById("proxy-toggle"),
  statusText: document.getElementById("status-text"),
  scheme: document.getElementById("proxy-scheme"),
  host: document.getElementById("proxy-host"),
  port: document.getElementById("proxy-port"),
  btnSave: document.getElementById("btn-save"),
  // 白名单
  manualCount: document.getElementById("manual-count"),
  btnManage: document.getElementById("btn-manage"),
  btnFetchPage: document.getElementById("btn-fetch-page"),
  btnFetchUrl: document.getElementById("btn-fetch-url"),
  urlInput: document.getElementById("url-input"),
  modeLine: document.getElementById("mode-line"),
  fetchArea: document.getElementById("fetch-area")
};

let currentSettings = null;
let fetchTimer = null;
let fetchTicks = 0;

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
  checkFetchState();
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
        text += "PAC 已应用（白名单命中走代理，其余直连）";
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

  // 代理配置
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
    els.statusText.textContent = `代理已开启 · ${currentSettings.scheme}://${currentSettings.host}:${currentSettings.port}`;
    els.statusText.classList.add("on");
  } else {
    els.statusText.textContent = "代理已关闭";
    els.statusText.classList.remove("on");
  }
}

// --- 白名单文件状态渲染已移至规则管理页 ---

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

// 保存配置（协议/地址/端口）
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

// 抓取接口域名（v1.2.1）：
// 「抓取本页接口域名」= 直接抓当前页面（更新 CDN 等资源域名，不输网址）
// 「抓取输入网址」= 打开指定网站抓包。
// 抓取期间（10 秒）全局代理，保证目标网站即使不在白名单也能完整打开；结束后自动加白名单并恢复。

// 抓取开始后的通用 UI：冻结按钮 10 秒 + 模式标识 + 进度区
function startCaptureUI(url, sourceLabel) {
  freezeFetchButtons();
  renderModeLine("capturing", 10);
  els.fetchArea.hidden = false;
  renderFetchProgress(0);
  const tip = els.fetchArea.querySelector(".fetch-preview");
  if (tip) tip.textContent = sourceLabel
    ? `${sourceLabel}，正在抓取接口域名…（10 秒后自动加入白名单）`
    : "页面已自动刷新，正在抓取接口域名…（10 秒后自动加入白名单）";
  startFetchPolling();
}

function freezeFetchButtons(ms = 10000) {
  els.btnFetchPage.disabled = true;
  els.btnFetchUrl.disabled = true;
  els.btnFetchPage.textContent = "抓取中…（10 秒）";
  els.btnFetchUrl.textContent = "抓取中…（10 秒）";
  setTimeout(() => {
    els.btnFetchPage.disabled = false;
    els.btnFetchUrl.disabled = false;
    els.btnFetchPage.textContent = "🔍 抓取本页接口域名";
    els.btnFetchUrl.textContent = "🌐 抓取输入网址";
  }, ms);
}

// 主按钮：抓当前页面（不需要输入网址）
els.btnFetchPage.addEventListener("click", async () => {
  if (els.btnFetchPage.disabled) return; // 冻结中，防止重复点击
  // 获取用户正在看的标签页
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
    showToast("请先打开要抓取的网页（http/https）");
    return;
  }
  const res = await send("START_CAPTURE", { tabId: tab.id, tabUrl: tab.url });
  if (!res.success) {
    showToast(res.error || "抓取失败");
    return;
  }
  startCaptureUI(null, "页面已自动刷新");
});

// 副按钮：抓输入网址（打开新标签页）
els.btnFetchUrl.addEventListener("click", async () => {
  if (els.btnFetchUrl.disabled) return; // 冻结中，防止重复点击
  const url = els.urlInput.value.trim();
  if (!url) {
    showToast("请先在输入框输入要抓取的网址");
    els.urlInput.focus();
    return;
  }
  const res = await send("START_CAPTURE", { url });
  if (!res.success) {
    showToast(res.error || "抓取失败");
    return;
  }
  startCaptureUI(url, `已打开 ${url} 抓包`);
});

// --- 模式状态行：白名单模式 / 全局代理抓取中 ---

function renderModeLine(state, remainingSec, added) {
  if (state === "capturing") {
    els.modeLine.className = "mode-line capturing";
    els.modeLine.textContent = `🔀 全局代理抓取中（剩余 ${Math.max(0, remainingSec)} 秒）… 结束后自动恢复白名单模式`;
  } else if (state === "done") {
    els.modeLine.className = "mode-line done";
    els.modeLine.textContent = `✅ 已自动添加 ${added || 0} 个域名，已恢复白名单模式（仅白名单域名走代理）`;
  } else {
    els.modeLine.className = "mode-line";
    els.modeLine.textContent = "白名单模式：仅白名单域名走代理，其余直连";
  }
}

// --- 抓取状态：进度展示与自动完成 ---

async function checkFetchState() {
  const res = await send("GET_CAPTURE");
  if (!res.success) return;
  if (!res.capture) {
    els.fetchArea.hidden = true;
    renderModeLine("normal");
    return;
  }
  els.fetchArea.hidden = false;
  renderFetch(res.capture, res.domains || [], res.elapsed || 0);
  if (res.capture.status === "capturing") {
    renderModeLine("capturing", Math.max(0, Math.ceil((10000 - res.elapsed) / 1000)));
    startFetchPolling();
  } else if (res.capture.status === "done") {
    renderModeLine("done", 0, res.capture.added);
  }
}

function startFetchPolling() {
  if (fetchTimer) return;
  fetchTimer = setInterval(async () => {
    fetchTicks++;
    await refreshFetch();
    if (fetchTicks >= 14) stopFetchPolling(); // 约 21 秒上限（1.5s × 14）
  }, 1500);
}

function stopFetchPolling() {
  if (fetchTimer) {
    clearInterval(fetchTimer);
    fetchTimer = null;
  }
}

async function refreshFetch() {
  const res = await send("GET_CAPTURE");
  if (!res.success) return;
  if (!res.capture) {
    stopFetchPolling();
    els.fetchArea.hidden = true;
    renderModeLine("normal");
    return;
  }
  renderFetch(res.capture, res.domains || [], res.elapsed || 0);
  if (res.capture.status === "capturing") {
    renderModeLine("capturing", Math.max(0, Math.ceil((10000 - res.elapsed) / 1000)));
  }
  if (res.capture.status === "done") {
    stopFetchPolling();
    renderModeLine("done", 0, res.capture.added);
    // 同步最新规则条数
    const st = await send("GET_STATE");
    if (st.success) {
      currentSettings = st.settings;
      const total = (st.fileRules || []).length + (currentSettings.manualRules || []).length;
      els.manualCount.textContent = `${total} 条`;
    }
  }
}

function renderFetchProgress(elapsedMs) {
  els.fetchArea.innerHTML = `
    <div class="fetch-status">正在抓取接口域名…（${Math.max(1, Math.round(elapsedMs / 1000))} 秒 / 10 秒）</div>
    <div class="fetch-bar"><div class="fetch-bar-in" style="width:${Math.min(100, Math.round((elapsedMs / 10000) * 100))}%"></div></div>
    <div class="fetch-preview">抓取结束后自动全部加入白名单，无需操作</div>`;
}

function renderFetch(cap, domains, elapsed) {
  if (cap.status === "capturing") {
    renderFetchProgress(elapsed);
    const count = domains.length;
    if (count > 0) {
      const tip = els.fetchArea.querySelector(".fetch-preview");
      if (tip) tip.textContent = `已捕获 ${count} 个域名 · 自动加入白名单中…`;
    }
    return;
  }
  // 已完成
  const hosts = domains.map((d) => d.host);
  if (cap.added === 0) {
    els.fetchArea.innerHTML = `
      <div class="fetch-status done">本次未抓到新的接口域名</div>
      <div class="fetch-done-hint">可能原因：页面未刷新、资源已缓存、或域名已在白名单中。可再点一次上方「抓取页面接口域名」，或先手动刷新页面后再抓</div>`;
    return;
  }
  const listHtml = hosts.length
    ? `<div class="fetch-done-list">${hosts.map((h) => `<span>${escapeHtml(h)}</span>`).join("")}</div>`
    : "";
  els.fetchArea.innerHTML = `
    <div class="fetch-status done">✅ 已自动添加 ${cap.added} 个域名到白名单</div>
    <div class="fetch-done-hint">本次抓到 ${hosts.length} 个域名，全部已加入白名单（重复自动去重），已恢复白名单模式。若页面还有内容没完全打开，再点一次上方按钮抓取补全</div>
    ${listHtml}`;
}

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
