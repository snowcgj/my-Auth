// 账户规范化：读取本地存储或扫码得到的账户对象后，补齐缺失字段、保留未知字段。
// 纯逻辑，不依赖 uni.*；非法值（如 digits=0、algorithm=SHA256）保留原样，
// 由 totp-core 在生成时抛错、卡片显示"配置不支持"，不在此静默修正。

const DEFAULT_ICON = '/static/logo.png';

export function normalizeAccount(account) {
  const fallbackId = Date.now();
  return {
    ...account,
    id: account.id ?? fallbackId,
    icon: account.icon ?? DEFAULT_ICON,
    app: account.app || account.issuer || account.accountName || 'Unknown App',
    name: account.name || account.accountName || 'Unknown Account',
    issuer: account.issuer ?? '',
    accountName: account.accountName || account.name || '',
    secret: account.secret ?? '',
    algorithm: account.algorithm ?? 'SHA1',
    digits: account.digits ?? 6,
    period: account.period ?? 30,
    pinned: account.pinned === true,
    sortOrder: account.sortOrder ?? (account.id ?? fallbackId),
    code: account.code ?? '',
    countdown: account.countdown ?? 30,
  };
}
