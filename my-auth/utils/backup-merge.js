// 备份与恢复的纯逻辑：序列化预处理、账户集合指纹、恢复合并去重。
// 不依赖 uni.*、Node Buffer/crypto；密码学在 backup-crypto.js（待实现），
// 文件 IO 在适配层。本模块只负责"账户数据"层面的纯函数变换。
//
// 设计见 .ai/plans/2026-10-26-encrypted-backup.md。
// 去重键取 secret（小写归一）：同一密钥能生成相同验证码，视为同一账户。
// 第一版合并策略只做 skip（重复项保留现有，incoming 重复项进清单），
// 不实现 overwrite 以避免在策略语义未与用户对齐时引入半成品行为。

// 运行时字段：每次重算，不属于账户数据，备份与指纹都剔除
const RUNTIME_FIELDS = ['code', 'countdown'];

// 剔除运行时字段，返回纯净副本（不改原数组、不改原对象）。
// 导出前调用，确保 code/countdown 不进加密容器。
export function serializeForBackup(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts.map(account => {
    const clean = { ...account };
    for (const key of RUNTIME_FIELDS) {
      delete clean[key];
    }
    return clean;
  });
}

// 去重键：secret 小写归一。同一密钥即同一账户。
// 空 secret（非法账户）返回空串，合并时按"不参与去重"处理。
export function buildDuplicateKey(account) {
  const secret = account && typeof account.secret === 'string' ? account.secret : '';
  return secret.toLowerCase();
}

// 账户集合稳定指纹：剔除运行时字段、按 secret 排序后确定性哈希。
// 仅用于"导出后是否变更"检测，不要求密码学强度；顺序无关、对运行时字段不敏感。
export function buildAccountFingerprint(accounts) {
  const clean = serializeForBackup(accounts);
  const keys = clean
    .map(buildDuplicateKey)
    .filter(Boolean)
    .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  if (keys.length === 0) return 'empty';
  // djb2 变体：碰撞概率对几百量级账户足够低，且实现简单、无依赖
  let hash = 5381;
  const text = keys.join('|');
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return `n${keys.length}:${hash.toString(36)}`;
}

// 合并：existing + incoming → { merged, duplicates, added }。
// 策略 skip：重复项保留现有（保留现有 pinned/sortOrder 等自定义），
//           incoming 重复项进 duplicates 清单供 UI 展示。
// incoming 内部若存在相同 secret，第二个起视为重复（只加入一次）。
// 合并是纯内存操作；持久化由调用方在合并成功后用 persistAccounts 落盘
// （复用 home.vue "先持久化成功再更新内存"约定）。
export function mergeAccounts(existing, incoming) {
  const existingArr = Array.isArray(existing) ? existing : [];
  const incomingArr = Array.isArray(incoming) ? incoming : [];

  const seenKeys = new Set(existingArr.map(buildDuplicateKey));
  const duplicates = [];
  const toAdd = [];

  for (const inc of incomingArr) {
    const key = buildDuplicateKey(inc);
    if (key && seenKeys.has(key)) {
      duplicates.push({ incoming: inc, reason: 'duplicate-secret' });
    } else {
      toAdd.push(inc);
      if (key) {
        seenKeys.add(key);
      }
    }
  }

  return {
    merged: [...existingArr, ...toAdd],
    duplicates,
    added: toAdd.length,
  };
}
