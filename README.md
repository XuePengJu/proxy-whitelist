# proxy-whitelist

基于 Clash 的 Chrome 代理白名单扩展（双项目）：一个**白名单走代理**，一个**白名单走直连**，配合 Clash 规则集使用。

## 项目一览

| 目录 | 扩展名 | 白名单语义 | 版本 |
| --- | --- | --- | --- |
| [`proxy-whitelist/`](proxy-whitelist/) | ClashMate | 白名单**走代理**，其余直连 | v1.0.0 |
| [`direct-whitelist/`](direct-whitelist/) | ProxyMate | 白名单**走直连**，其余走代理 | v1.0.0 |

两个项目的唯一区别是白名单的方向：加进 `proxy-whitelist` 的域名走代理，加进 `direct-whitelist` 的域名走直连。

---

## ClashMate — 白名单走代理（proxy-whitelist/）

用于访问被墙/海外网站（YouTube、Google 等）。

- **代理配置**：协议固定 SOCKS5、端口固定 7897，代理地址可编辑
- **抓包一键加白名单**：点击「抓取本页接口域名」自动刷新当前页面，10 秒内抓取该页请求的全部域名并**自动加入白名单**（无需勾选）；也可输入网址打开新标签页抓包
- **抓取期间全局代理**：抓取时临时让所有流量走代理，目标网站不在白名单也能完整打开，抓全域名后自动恢复白名单模式
- **模式标识**：页面右上角悬浮标（10 秒倒计时）、图标角标橙色 CAP、弹窗模式状态行
- 规则文件：`rules/proxy-whitelist.txt`

## ProxyMate — 白名单走直连（direct-whitelist/）

用于国内域名 / AI 厂商官网直连，避免走代理被检测、封禁。

- 内置 160+ 条国内大厂 / AI 模型厂商域名（DeepSeek、GLM、Kimi、豆包、千问办公、Qoder CN 等）
- 支持手动添加、文件导入（txt / clash / json 自动识别）
- 规则文件：`rules/cn-direct.txt` + 手动规则

---

## 安装

1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择对应项目目录（`proxy-whitelist/` 或 `direct-whitelist/`）

> 两个扩展可同时安装，互不冲突：ClashMate 负责"翻墙"，ProxyMate 负责"国内直连"。

## 使用

- **首次访问国外网站**：打开网站 → 点击 ClashMate 图标 → 「抓取本页接口域名」→ 10 秒后域名自动入白名单 → 刷新页面即可完整访问
- **网站更新了 CDN / 接口**：再次打开该网站 → 点「抓取本页接口域名」补全新域名
- **国内网站异常走代理**：把域名加进 ProxyMate 白名单即可强制直连

## 目录结构

```
├── proxy-whitelist/      # ClashMate（白名单走代理）
│   ├── manifest.json
│   ├── icons/
│   ├── rules/
│   │   └── proxy-whitelist.txt
│   └── src/
│       ├── background/
│       ├── popup/
│       ├── rules/
│       └── utils/
├── direct-whitelist/     # ProxyMate（白名单走直连）
│   ├── manifest.json
│   ├── icons/
│   ├── rules/
│   │   └── cn-direct.txt
│   └── src/
│       ├── background/
│       ├── popup/
│       ├── rules/
│       └── utils/
└── README.md
```
