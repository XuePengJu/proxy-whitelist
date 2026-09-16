# ClashMate

极简 Clash 代理开关：**代理白名单模式**——只有加进白名单的域名/IP 才走 Clash 代理，其余全部直连（不走代理）。

> 与 ProxyMate（国内域名直连、其余走代理）的规则方向相反，本插件适合"默认直连、特定网站走代理"的场景。

## 功能

- **一键开关**：点击图标即可启用/关闭代理
- **代理白名单（v1.0）**：
  - 自动读取扩展内置 `rules/proxy-whitelist.txt` 规则文件，命中的域名/IP **走 Clash 代理**，未命中 **直连**（文件不存在/为空则全部直连，不影响任何访问）
  - 支持手动输入批量规则（每行一条）
  - 支持文件导入：`.txt` / Clash RuleSet YAML / Clash List / `.json`，自动识别格式
- **固定配置**：协议 SOCKS5、端口 7897 固定（Clash 默认混合端口）
- **代理地址可编辑**：默认 `127.0.0.1`，可改为局域网/其他主机
- **状态指示**：图标和 Badge 实时显示代理状态，弹窗展示 Chrome 实际生效状态

## 安装

1. 打开 Chrome 扩展管理页面：`chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本文件夹（`ClashMate/`）

## 使用

1. 确保本地 Clash 已运行（默认端口 7897）
2. 点击浏览器工具栏 ClashMate 图标，打开开关
3. **白名单文件**：编辑 `rules/proxy-whitelist.txt`（每行一条规则），保存后重开弹窗即自动生效
4. **手动添加/导入文件**：在「管理全部规则」页添加或导入走代理的域名

### 规则文件格式（rules/proxy-whitelist.txt）

```
# 注释以 # 开头
google.com          # 匹配该域名及所有子域（走代理）
=example.com        # 仅匹配该域名本身
*.qq.com            # 通配符
223.5.5.0/24        # IP 段（仅对 IP 字面量生效）
114.114.114.114     # 单个 IP
```

文件导入额外支持 Clash 格式：`DOMAIN-SUFFIX,baidu.com`、`DOMAIN,example.com`、`IP-CIDR,1.2.3.0/24,no-resolve`（YAML 的 `payload:` 列表或逐行 List）。

## 技术栈

- Chrome Manifest V3
- Service Worker
- chrome.proxy API（PAC 脚本模式，白名单命中走代理）
- chrome.storage.local

## 目录结构

```
ClashMate/
├── manifest.json
├── rules/
│   └── proxy-whitelist.txt   # 代理白名单规则（默认读取，初始为空）
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   ├── icon-128.png
│   ├── icon-on-16.png
│   ├── icon-on-32.png
│   ├── icon-off-16.png
│   └── icon-off-32.png
├── src/
│   ├── background/
│   │   └── service-worker.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── rules/
│   │   ├── rules.html        # 独立规则管理页
│   │   ├── rules.css
│   │   └── rules.js
│   └── utils/
│       ├── proxy.js
│       ├── storage.js
│       ├── ruleset.js       # 规则解析
│       └── pac.js           # PAC 编译（白名单模式）
└── README.md
```
