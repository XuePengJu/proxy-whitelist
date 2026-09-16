#!/bin/bash
# ============================================================
# ProxyMate - 打开规则文件
# 双击本脚本，将用默认文本编辑器打开规则文件 cn-direct.txt
# 编辑保存后，重开插件弹窗（或规则管理页刷新）即可生效
# ============================================================

# 定位到脚本所在目录（脚本可随项目移动）
DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="$DIR/proxy-mate/rules/cn-direct.txt"

if [ -f "$FILE" ]; then
  open "$FILE"
else
  echo "未找到规则文件: $FILE"
  echo "请确认项目结构为: Chrome代理插件/proxy-mate/rules/cn-direct.txt"
  # 停留窗口，方便看到错误信息
  read -r -p "按回车键关闭…" _
fi
