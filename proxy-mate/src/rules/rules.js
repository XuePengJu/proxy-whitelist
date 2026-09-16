// ============================================================
// ProxyMate - 规则管理页逻辑
// 显示全部规则（文件规则 + 手动规则），支持添加/删除/导入
// ============================================================

const els = {
  ruleInput: document.getElementById("rule-input"),
  btnAdd: document.getElementById("btn-add"),
  btnImport: document.getElementById("btn-import"),
  fileInput: document.getElementById("file-input"),
  fileMeta: document.getElementById("file-meta"),
  fileList: document.getElementById("file-list"),
  manualList: document.getElementById("manual-list"),
  manualCount: document.getElementById("manual-count")
};

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
  renderFileRules(res.fileRules || []);
  renderManualRules(res.settings.manualRules || []);
  if (res.settings.lastError) showToast(res.settings.lastError, 4000);
}

// --- 渲染文件规则（只读） ---

function renderFileRules(fileRules) {
  const meta = els.fileMeta;
  const list = els.fileList;
  list.innerHTML = "";

  if (!fileRules || fileRules.length === 0) {
    meta.textContent = "未找到规则或文件为空";
    meta.className = "meta warn";
    list.innerHTML = `<div class="empty">文件规则为空</div>`;
    return;
  }

  meta.textContent = `${fileRules.length} 条规则已加载 · 命中即直连不走代理`;
  meta.className = "meta";

  for (const rule of fileRules) {
    const item = document.createElement("span");
    item.className = "rule-item file";
    item.textContent = rule.type === "domain" ? "=" + rule.value : rule.value;
    list.appendChild(item);
  }
}

// --- 渲染手动规则（可删除） ---

function renderManualRules(list) {
  const el = els.manualList;
  el.innerHTML = "";
  els.manualCount.textContent = `${list.length} 条`;

  if (!list || list.length === 0) {
    el.innerHTML = `<div class="empty">暂无手动规则</div>`;
    return;
  }

  for (const rule of list) {
    const item = document.createElement("span");
    item.className = "rule-item";
    const label = rule.type === "domain" ? "=" + rule.value : rule.value;
    item.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <button class="remove" title="删除">&times;</button>
    `;
    item.querySelector(".remove").addEventListener("click", () => removeRule(rule));
    el.appendChild(item);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// --- 添加规则 ---

async function addRule() {
  const text = els.ruleInput.value.trim();
  if (!text) {
    showToast("请输入域名或 IP");
    return;
  }
  const res = await send("ADD_RULES", { text });
  if (res.success) {
    els.ruleInput.value = "";
    renderManualRules(res.manualRules);
    showToast("已添加");
  } else {
    showToast(res.error || "添加失败");
  }
}

els.btnAdd.addEventListener("click", addRule);
els.ruleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addRule();
});

// --- 删除规则 ---

async function removeRule(rule) {
  const res = await send("REMOVE_RULE", { ruleType: rule.type, value: rule.value });
  if (res.success) {
    renderManualRules(res.manualRules);
  } else {
    showToast(res.error || "删除失败");
  }
}

// --- 导入文件 ---

els.btnImport.addEventListener("click", () => els.fileInput.click());

els.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const res = await send("IMPORT_RULES", { text: ev.target.result });
    if (res.success) {
      renderManualRules(res.manualRules);
      const st = res.stats || {};
      showToast(`已导入 ${file.name}（${res.format}）：新增 ${st.added} 条，重复 ${st.duplicate} 条，无效 ${st.skipped} 条`);
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

// --- Toast ---

function showToast(message, duration = 2500) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

init();
