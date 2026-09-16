# ProxyMate

一键切换浏览器代理到本地 Clash，支持域名白名单。

## 功能

- **一键开关**：点击图标即可启用/关闭代理
- **域名白名单**：自定义哪些域名不走代理
- **灵活配置**：支持修改代理协议和端口
- **状态指示**：图标和 Badge 实时显示代理状态

## 安装

1. 打开 Chrome 扩展管理页面：`chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本文件夹

## 使用

1. 确保本地 Clash 已运行（默认端口 7897）
2. 点击浏览器工具栏 ProxyMate 图标
3. 打开开关即可连接代理
4. 在「不走代理的域名」中添加白名单域名

## 技术栈

- Chrome Manifest V3
- Service Worker
- chrome.proxy API
- chrome.storage.local

## 目录结构

```
proxy-mate/
├── manifest.json
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
│       └── storage.js
└── README.md
```
