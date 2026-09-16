# Chrome 代理白名单扩展（双项目）

一套基于 **Clash** 的 Chrome 代理白名单扩展，包含两个互补的项目：

| 项目 | 目录 | 白名单语义 | 版本 | 典型用途 |
| --- | --- | --- | --- | --- |
| **代理白名单**（ClashMate） | `proxy-whitelist/` | 白名单**走代理**，其余直连 | v1.2.1 | 访问被墙/海外网站（YouTube、Google 等），抓包一键加域名 |
| **白名单直连**（ProxyMate） | `direct-whitelist/` | 白名单**走直连**，其余走代理 | v1.3.2 | 国内域名/AI 厂商官网直连，避免走代理被检测 |

> 两者区别只在于白名单的语义方向：一个"加进去走代理"，一个"加进去走直连"。

---

## 代理白名单 proxy-whitelist（白名单走代理）

- 代理协议固定 **SOCKS5**，端口固定 **7897**，代理地址可编辑
- **抓取接口域名**：点「抓取本页接口域名」自动刷新当前页面，10 秒内抓取该页请求的所有域名并**自动全部加入白名单**（无需勾选）；也可输入网址打开新标签页抓包
- **抓取期间全局代理**：抓取时临时让所有流量走代理，目标网站不在白名单也能完整打开，抓全域名后自动恢复白名单模式
- 三重模式标识：页面右上角悬浮标（10 秒倒计时）+ 图标角标橙色 CAP + 弹窗模式状态行
- 规则文件：`rules/proxy-whitelist.txt`（格式见项目内 README）

## 白名单直连 direct-whitelist（白名单走直连）

- 白名单内域名**直连**，其余流量走本地 Clash 代理
- 内置 160+ 条国内大厂 / AI 模型厂商域名（DeepSeek、GLM、Kimi、豆包、千问办公、Qoder CN 等），并支持手动添加、文件导入
- 规则文件：`rules/cn-direct.txt` + 手动规则

---

## 安装

1. 打开 Chrome 扩展管理页面：`chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择对应的项目目录（`proxy-whitelist/` 或 `direct-whitelist/`）

> 两个扩展可同时安装：proxy-whitelist 负责"白名单走代理"（翻墙），direct-whitelist 负责"白名单走直连"（国内），配合 Clash 规则集使用。

## 目录结构

```
├── proxy-whitelist/      # 白名单走代理（ClashMate）
│   ├── manifest.json
│   ├── icons/
│   ├── rules/
│   │   └── proxy-whitelist.txt
│   └── src/
│       ├── background/
│       ├── popup/
│       ├── rules/
│       └── utils/
├── direct-whitelist/     # 白名单走直连（ProxyMate）
│   ├── manifest.json
│   ├── icons/
│   ├── rules/
│   │   └── cn-direct.txt
│   └── src/
│       ├── background/
│       ├── popup/
│       ├── rules/
│       └── utils/
└── 需求文档_Chrome代理插件.md
```
