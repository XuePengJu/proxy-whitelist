# ProxyMate

一键切换浏览器代理到本地 Clash，支持规则集（国内域名直连）与域名白名单。

## 功能

- **一键开关**：点击图标即可启用/关闭代理
- **规则集（v1.1）**：
  - 自动读取扩展内置 `rules/cn-direct.txt` 规则文件，命中的域名/IP 直接连接不走代理（文件不存在则规则集置空）
  - 支持手动输入批量规则（每行一条）
  - 支持文件导入：`.txt` / Clash RuleSet YAML / Clash List / `.json`，自动识别格式
- **域名白名单**：自定义哪些域名不走代理
- **灵活配置**：支持修改代理协议和端口
- **状态指示**：图标和 Badge 实时显示代理状态

## 安装

1. 打开 Chrome 扩展管理页面：`chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本文件夹（`proxy-mate/`）

## 使用

1. 确保本地 Clash 已运行（默认端口 7897）
2. 点击浏览器工具栏 ProxyMate 图标，打开开关即可连接代理
3. **规则文件**：编辑 `rules/cn-direct.txt`（每行一条规则），保存后重开弹窗即自动生效
4. **手动规则/导入文件**：在「国内域名直连规则集」中输入或导入

### 规则文件格式（rules/cn-direct.txt）

```
# 注释以 # 开头
baidu.com          # 匹配该域名及所有子域
=example.com       # 仅匹配该域名本身
*.taobao.com       # 通配符
223.5.5.0/24       # IP 段（仅对 IP 字面量生效）
114.114.114.114    # 单个 IP
```

文件导入额外支持 Clash 格式：`DOMAIN-SUFFIX,baidu.com`、`DOMAIN,example.com`、`IP-CIDR,1.2.3.0/24,no-resolve`（YAML 的 `payload:` 列表或逐行 List）。

## 技术栈

- Chrome Manifest V3
- Service Worker
- chrome.proxy API（PAC 脚本模式）
- chrome.storage.local

## 目录结构

```
proxy-mate/
├── manifest.json
├── rules/
│   └── cn-direct.txt        # 国内域名直连规则（默认读取）
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
│   └── utils/
│       ├── proxy.js
│       ├── storage.js
│       ├── ruleset.js       # 规则解析（v1.1）
│       └── pac.js           # PAC 编译（v1.1）
└── README.md
```
