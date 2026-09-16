// ============================================================
// ClashMate - 代理配置工具模块
// ============================================================

export function buildProxyConfig({ scheme, host, port, bypassList }) {
  const proxyServer = { scheme, host, port };
  return {
    mode: "fixed_servers",
    rules: {
      proxyForHttp: proxyServer,
      proxyForHttps: proxyServer,
      fallbackProxy: proxyServer,
      bypassList: [...bypassList]
    }
  };
}

export function buildDirectConfig() {
  return { mode: "direct" };
}

export function normalizeDomain(raw) {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.startsWith(".") && !trimmed.startsWith("*")) {
    return "*" + trimmed;
  }
  return trimmed;
}

export function isValidDomain(domain) {
  const d = domain.trim();
  if (!d) return false;
  if (d === "<local>") return true;
  // CIDR 格式
  if (/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(d)) return true;
  if (/^[\[\d\.:a-fA-F\]]+$/.test(d)) return true; // IPv6
  // 域名格式
  if (/^[\*\.a-z0-9\-]+$/.test(d)) return true;
  return false;
}
