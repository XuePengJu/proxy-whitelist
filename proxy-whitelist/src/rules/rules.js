// ============================================================
// ClashMate - 规则管理页逻辑
// 代理白名单统一列表（文件规则 + 手动规则），支持添加/删除/导入/复制
// ============================================================

const els = {
  ruleInput: document.getElementById("rule-input"),
  btnAdd: document.getElementById("btn-add"),
  btnCopy: document.getElementById("btn-copy"),
  copyHint: document.getElementById("copy-hint"),
  btnImport: document.getElementById("btn-import"),
  fileInput: document.getElementById("file-input"),
  listMeta: document.getElementById("list-meta"),
  ruleList: document.getElementById("rule-list"),
  totalCount: document.getElementById("total-count"),
  fileRulesToggle: document.getElementById("file-rules-toggle"),
  fileRuleStatus: document.getElementById("file-rule-status"),
  fileRuleHint: document.getElementById("file-rule-hint")
};

let currentFileRules = [];
let currentManualRules = [];

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
  currentFileRules = res.fileRules || [];
  currentManualRules = res.settings.manualRules || [];
  els.fileRulesToggle.checked = res.settings.fileRulesEnabled !== false;
  renderAll();
  if (res.settings.lastError) showToast(res.settings.lastError, 4000);
}

// --- 渲染全部白名单（文件规则 + 手动规则，去重合并，来源标记） ---

function renderAll() {
  const list = els.ruleList;
  list.innerHTML = "";

  // 合并：手动规则覆盖同名文件规则（手动优先展示可删）
  const manualMap = {};
  for (const r of currentManualRules) manualMap[r.type + "|" + r.value] = r;

  const items = [];
  for (const r of currentFileRules) {
    const key = r.type + "|" + r.value;
    if (manualMap[key]) {
      // 手动版展示（可删）
      items.push({ label: r.type === "domain" ? "=" + r.value : r.value, source: "manual", rule: manualMap[key] });
      delete manualMap[key];
    } else {
      items.push({ label: r.type === "domain" ? "=" + r.value : r.value, source: "file", rule: r });
    }
  }
  for (const key in manualMap) {
    const r = manualMap[key];
    items.push({ label: r.type === "domain" ? "=" + r.value : r.value, source: "manual", rule: r });
  }

  const total = items.length;
  els.totalCount.textContent = `${total} 条`;

  if (!total) {
    els.listMeta.textContent = "白名单为空：未命中任何规则时全部直连";
    els.listMeta.className = "meta warn";
    list.innerHTML = `<div class="empty">白名单为空，添加或导入后生效</div>`;
    return;
  }

  const fileCount = currentFileRules.length;
  els.listMeta.textContent = `文件规则 ${fileCount} 条 + 手动 ${currentManualRules.length} 条 · 命中即走代理，其余直连`;
  els.listMeta.className = "meta";

  // 文件规则状态
  if (els.fileRulesToggle.checked) {
    els.fileRuleStatus.textContent = `${fileCount} 条已启用`;
    els.fileRuleStatus.classList.remove("warn");
  } else {
    els.fileRuleStatus.textContent = "已停用";
    els.fileRuleStatus.classList.add("warn");
  }

  for (const item of items) {
    const el = document.createElement("span");
    el.className = "rule-item" + (item.source === "file" ? " file" : "");
    const srcTag = item.source === "file" ? '<span class="src-tag">📄</span>' : '<span class="src-tag src-manual">✚</span>';
    const removeBtn = item.source === "manual"
      ? '<button class="remove" title="删除">&times;</button>'
      : "";
    el.innerHTML = `${srcTag}<span>${escapeHtml(item.label)}</span>${removeBtn}`;
    if (item.source === "manual") {
      el.querySelector(".remove").addEventListener("click", () => removeRule(item.rule));
    }
    list.appendChild(el);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// --- 刷新数据（改动后统一重新拉取） ---

async function refresh() {
  const res = await send("GET_STATE");
  if (!res.success) return;
  currentFileRules = res.fileRules || [];
  currentManualRules = res.settings.manualRules || [];
  renderAll();
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
    currentManualRules = res.manualRules;
    renderAll();
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
    currentManualRules = res.manualRules;
    renderAll();
  } else {
    showToast(res.error || "删除失败");
  }
}

// --- 复制完整规则清单 ---

els.btnCopy.addEventListener("click", async () => {
  const lines = [];
  for (const r of currentFileRules) {
    lines.push(r.type === "domain" ? "=" + r.value : r.value);
  }
  for (const r of currentManualRules) {
    const line = r.type === "domain" ? "=" + r.value : r.value;
    if (!lines.includes(line)) lines.push(line);
  }
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    els.copyHint.style.display = "block";
    showToast(`已复制 ${lines.length} 条规则`);
    setTimeout(() => { els.copyHint.style.display = "none"; }, 3000);
  } catch (e) {
    showToast("复制失败，请手动选择");
  }
});

// --- 导入文件 ---

els.btnImport.addEventListener("click", () => els.fileInput.click());

els.fileInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const res = await send("IMPORT_RULES", { text: ev.target.result });
    if (res.success) {
      currentManualRules = res.manualRules;
      renderAll();
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

// --- 文件规则开关 ---

els.fileRulesToggle.addEventListener("change", async () => {
  const enabled = els.fileRulesToggle.checked;
  const res = await send("TOGGLE_FILE_RULES", { enabled });
  if (res.success) {
    await refresh();
    showToast(res.fileRulesEnabled ? "文件规则已启用" : "文件规则已停用");
  } else {
    els.fileRulesToggle.checked = !enabled;
    showToast(res.error || "操作失败");
  }
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
