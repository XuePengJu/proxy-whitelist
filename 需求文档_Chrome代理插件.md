# Chrome 代理插件 - 需求规格说明书

## 一、项目概述

### 1.1 项目名称
**ProxyMate** — 轻量级 Chrome 代理切换插件

### 1.2 项目定位
一个基于 **Manifest V3** 标准的 Chrome 浏览器扩展，将浏览器网络请求代理到本地 Clash 端口（默认 `127.0.0.1:7897`），并提供域名白名单（Bypass List）功能，让用户灵活控制哪些域名不走代理。

### 1.3 核心价值
- **一键开关**：点击图标即可启用/关闭代理，无需到系统设置中切换
- **灵活白名单**：自定义哪些域名直连，哪些走代理
- **轻量简洁**：无多余功能，专注代理切换这一件事

---

## 二、技术选型与标准

### 2.1 遵循标准
| 项目 | 标准 |
|------|------|
| 清单版本 | **Manifest V3** |
| 后台脚本 | **Service Worker**（非持久化） |
| 弹出窗口 | **Action Popup**（替代 browser_action） |
| 存储 | **chrome.storage.local**（异步） |
| 代理 API | **chrome.proxy** |
| 权限模型 | 最小权限原则 |

### 2.2 关键技术 API
- `chrome.proxy.settings.set()` — 设置代理配置
- `chrome.proxy.settings.get()` — 获取当前代理配置
- `chrome.proxy.settings.clear()` — 清除代理配置
- `chrome.storage.local` — 持久化用户设置
- `chrome.action.setIcon()` — 动态切换图标状态
- `chrome.action.onClicked` — 点击图标事件（如不需要 popup）

---

## 三、功能需求（详细）

### F1 — 代理开关（核心功能）

**描述**：控制是否将浏览器请求代理到本地 Clash 端口。

**详细规则**：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| 代理协议 | `socks5` | Clash 默认使用 SOCKS5，也支持 HTTP |
| 代理地址 | `127.0.0.1` | 本机地址 |
| 代理端口 | `7897` | Clash 默认混合端口 |
| 代理范围 | `regular` | 仅常规窗口，无痕窗口可单独设置 |

**交互行为**：
- 点击插件图标 → 弹出 Popup 窗口
- Popup 中显示一个大开关（Toggle Switch）
- **开启状态**：开关为蓝色/绿色，图标亮色，所有请求走代理
- **关闭状态**：开关为灰色，图标灰色/暗色，所有请求直连

**实现方式**：

```js
// 开启代理 - fixed_servers 模式
const proxyConfig = {
  mode: "fixed_servers",
  rules: {
    singleProxy: {
      scheme: "socks5",
      host: "127.0.0.1",
      port: 7897
    },
    bypassList: ["<local>", ...userBypassList]
  }
};
chrome.proxy.settings.set({ value: proxyConfig, scope: "regular" });

// 关闭代理 - direct 模式
const directConfig = { mode: "direct" };
chrome.proxy.settings.set({ value: directConfig, scope: "regular" });
```

---

### F2 — 域名白名单（Bypass List）

**描述**：用户可以添加不走代理的域名列表，这些域名的请求将直接连接。

**交互方式**：
- Popup 窗口中有一个文本输入框 + "添加"按钮
- 输入域名后回车或点击"添加"，域名加入列表
- 列表以标签（Tag/Chip）形式展示，每个标签带 "×" 删除按钮
- 支持批量添加（用逗号或换行分隔多个域名）

**域名格式支持**：

| 格式 | 示例 | 匹配范围 |
|------|------|----------|
| 完整域名 | `baidu.com` | 精确匹配 `baidu.com` |
| 通配符前缀 | `*.baidu.com` | 匹配所有子域名 |
| CIDR IP段 | `192.168.1.0/24` | 匹配 IP 范围 |
| `<local>` | `<local>` | 所有简单主机名（不含点号） |

**验证规则**：
- 不允许空字符串
- 不允许重复域名
- 去除首尾空格
- 自动将 `.baidu.com` 转为 `*.baidu.com`

**持久化**：白名单数据存储在 `chrome.storage.local`，重启浏览器后保留。

---

### F3 — 代理端口配置（扩展功能）

**描述**：允许用户修改本地 Clash 的代理端口和协议。

| 配置项 | 默认值 | 可选值 |
|--------|--------|--------|
| 协议 | `socks5` | `http` / `https` / `socks5` |
| 端口 | `7897` | 1-65535 |
| 地址 | `127.0.0.1` | 本机地址（一般不改） |

---

### F4 — 状态指示与视觉反馈

**描述**：通过图标和 Badge 文字直观展示当前代理状态。

| 状态 | 图标颜色 | Badge 文字 | Popup 开关 |
|------|----------|------------|------------|
| 代理开启 | 彩色/亮色 | `ON` | 开启 |
| 代理关闭 | 灰色/暗色 | `OFF` | 关闭 |
| 连接错误 | 红色/警告色 | `ERR` | — |

**Badge 细节**：
- 背景色与状态对应
- 文字简短（2-3 字符）
- 刷新间隔：状态变化时实时更新

---

## 四、用户界面设计（Popup）

### 4.1 布局结构

```
┌──────────────────────────────┐
│  🔌 ProxyMate               │  ← 标题栏（插件名 + 版本）
├──────────────────────────────┤
│                              │
│     ┌─────────────────┐     │
│     │   🔘 代理开关    │     │  ← 大开关（Toggle Switch）
│     │   状态：已连接    │     │
│     └─────────────────┘     │
│                              │
│  ┌─ 代理配置 ──────────────┐ │
│  │ 协议：[socks5  ▾]       │ │  ← 下拉选择
│  │ 端口：[7897          ]  │ │  ← 输入框
│  └─────────────────────────┘ │
│                              │
│  ┌─ 不走代理的域名 ────────┐ │
│  │ ┌──────────────────────┐ │ │
│  │ │ 添加域名...     [+]  │ │ │  ← 输入框 + 添加按钮
│  │ └──────────────────────┘ │ │
│  │                          │ │
│  │ [baidu.com ×] [qq.com ×]│ │  ← 域名标签列表
│  │ [*.google.com ×]        │ │
│  └─────────────────────────┘ │
│                              │
│       [💾 保存设置]          │  ← 保存按钮
└──────────────────────────────┘
```

### 4.2 交互细节
- Popup 宽度：320px
- 开关切换：立即生效，无需额外点击"保存"
- 域名增删：即时更新，自动保存
- 配置修改（端口/协议）：点击"保存设置"后生效
- 关闭 Popup 不影响代理状态

---

## 五、数据流与架构

### 5.1 架构图

```
┌─────────────────────────────────────────────┐
│                  Chrome 浏览器                │
│                                             │
│  ┌──────────┐    ┌──────────────────────┐   │
│  │  Popup   │◄──►│   Service Worker     │   │
│  │  (UI层)  │    │   (逻辑层)            │   │
│  └──────────┘    │                      │   │
│                  │  - 代理开关管理       │   │
│  ┌──────────┐    │  - 白名单管理         │   │
│  │  Storage │◄──►│  - 状态同步           │   │
│  │  (数据层) │    └──────┬───────────────┘   │
│  └──────────┘           │                   │
│                         │ chrome.proxy API  │
│                         ▼                   │
│                  ┌──────────────┐           │
│                  │ 代理配置层    │           │
│                  └──────┬───────┘           │
└─────────────────────────┼───────────────────┘
                          │
                   ┌──────▼───────┐
                   │  本地 Clash   │
                   │ 127.0.0.1    │
                   │ 端口 7897    │
                   └──────────────┘
```

### 5.2 消息通信

```
Popup UI ──chrome.runtime.sendMessage()──► Service Worker
Service Worker ──chrome.runtime.sendMessage()──► Popup UI
Service Worker ──chrome.storage.local──► 持久化数据
```

---

## 六、项目文件结构

```
proxy-mate/
├── manifest.json              # 扩展清单（Manifest V3）
├── icons/
│   ├── icon-16.png           # 16x16 图标
│   ├── icon-32.png           # 32x32 图标
│   ├── icon-48.png           # 48x48 图标
│   ├── icon-128.png          # 128x128 图标
│   ├── icon-on-16.png        # 开启状态 16px
│   ├── icon-on-32.png        # 开启状态 32px
│   ├── icon-off-16.png       # 关闭状态 16px
│   └── icon-off-32.png       # 关闭状态 32px
├── src/
│   ├── background/
│   │   └── service-worker.js  # Service Worker（核心逻辑）
│   ├── popup/
│   │   ├── popup.html         # Popup 页面结构
│   │   ├── popup.css          # Popup 样式
│   │   └── popup.js           # Popup 交互逻辑
│   └── utils/
│       ├── proxy.js           # 代理配置工具函数
│       └── storage.js         # 存储读写工具函数
├── _locales/                   # 国际化（可选）
│   ├── en/
│   │   └── messages.json
│   └── zh_CN/
│       └── messages.json
└── README.md
```

---

## 七、manifest.json 关键配置

```json
{
  "manifest_version": 3,
  "name": "ProxyMate",
  "version": "1.0.0",
  "description": "一键切换浏览器代理到本地 Clash",
  "permissions": [
    "proxy",
    "storage"
  ],
  "host_permissions": [],
  "background": {
    "service_worker": "src/background/service-worker.js"
  },
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_title": "ProxyMate",
    "default_icon": {
      "16": "icons/icon-off-16.png",
      "32": "icons/icon-off-32.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

---

## 八、开发计划（建议）

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| **Phase 1** | 项目骨架 + manifest.json + 图标资源 | P0 |
| **Phase 2** | Service Worker 核心逻辑（代理开关） | P0 |
| **Phase 3** | Popup UI（开关 + 基本样式） | P0 |
| **Phase 4** | 域名白名单功能（增删 + 持久化） | P1 |
| **Phase 5** | 端口/协议配置 | P1 |
| **Phase 6** | 状态图标切换 + Badge 文字 | P2 |
| **Phase 7** | 错误处理 + 连接检测 | P2 |
| **Phase 8** | 国际化 + 打包发布 | P3 |

---

## 九、待确认/可扩展的需求

以下是我整理过程中想到的可以进一步讨论的点：

1. **是否需要连接测试功能？** 点击"测试连接"按钮，尝试通过代理访问一个测试 URL，确认 Clash 是否正常运行。

2. **是否需要 PAC 脚本模式？** 除了 `fixed_servers` 模式，是否考虑支持自定义 PAC 脚本，实现更复杂的代理规则？

3. **是否需要规则导入/导出？** 允许用户将白名单配置导出为 JSON 文件，或从文件导入。

4. **是否需要自动切换模式？** 根据当前网络环境（如是否连接到公司 WiFi）自动开启/关闭代理。

5. **是否需要快捷键支持？** 通过键盘快捷键（如 `Ctrl+Shift+P`）快速切换代理开关。

6. **是否需要多个代理配置方案（Profile）？** 用户可以保存多套代理配置（如 Clash、Shadowsocks、公司代理），一键切换。

7. **是否需要流量统计？** 显示通过代理/直连的请求数量统计。

8. **Clash 端口是否自动检测？** 尝试自动探测本地 Clash 是否在运行，端口是否正确。

---

## 十、总结

核心功能非常清晰：**代理开关 + 域名白名单**，技术栈使用 Manifest V3 + chrome.proxy API + chrome.storage.local。整体是一个小而美的工具，开发周期短、维护成本低。

建议先做 Phase 1-4 的 MVP 版本，后续根据实际使用体验再迭代扩展功能。

---

> 📅 创建日期：2026-07-10
> 📝 版本：v1.0-draft
