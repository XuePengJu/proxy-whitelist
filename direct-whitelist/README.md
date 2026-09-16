# ProxyMate — 白名单走直连

Chrome MV3 代理插件：**白名单内域名走直连**（不走代理），其余流量走本地 Clash 代理。

> 与 ClashMate（白名单走代理）方向相反：ProxyMate 用于"国内域名直连、其余走代理"。

## 功能

- **一键开关**：点击图标即可启用/关闭代理
- **白名单走直连**：规则文件 `rules/cn-direct.txt`，内置 **160+** 条国内大厂 / AI 模型厂商域名（DeepSeek、GLM、Kimi、豆包、千问办公、Qoder CN 等）
- **手动添加**：弹窗/规则管理页直接添加域名
- **文件导入**：支持 txt / clash / json 格式自动识别
- **独立规则管理页**：统一列表、来源徽标、一键复制完整清单

## 安装

1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录（`direct-whitelist/`）

## 使用

1. 确保本地 Clash 已运行（默认端口 7897）
2. 打开开关，白名单外流量走代理
3. 需要国内网站/厂商直连时，把域名加进白名单（或直接编辑 `rules/cn-direct.txt`）

## 目录结构

```
direct-whitelist/
├── manifest.json
├── icons/
├── rules/
│   └── cn-direct.txt
└── src/
    ├── background/
    ├── popup/
    ├── rules/
    └── utils/
```
