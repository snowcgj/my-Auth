# 加密备份与恢复 设计（2026-10-26）

- 状态：**V1+V2 已通过真机最小验证**（加密往返、SAF 读写、合并写回）；批次 C（正式 UI）待开工；批次 D（错密码/取消/原账户不变收尾）待测
- 验收平台：Android 真机（HBuilderX 5.26 + 5+ Runtime）
- 范围：本地加密文件备份与恢复，**不含**账号系统、云同步、明文导出

## 1. 背景与目标

搜索、复制、置顶、删除确认已改善日常使用；当前最缺的是换机、卸载或设备损坏后如何找回账户。本功能给账户数据一条"退路"。优先级排在编辑、手动添加、界面改版之前，因为账户一旦丢失，界面和操作都帮不上忙。

## 2. 需求清单（来自用户）

### 2.1 功能

| 功能 | 用户操作与结果 |
|---|---|
| 创建备份 | 设置备份密码，选择位置，导出加密文件 |
| 恢复预览 | 选择文件、输入密码，先展示可恢复的账户（数量、导出时间），不立即写入 |
| 合并恢复 | 保留已有账户，对重复项给出明确处理（默认跳过，保留现有） |
| 备份状态 | 显示最近导出时间、导出后是否发生账户变更 |
| 错误处理 | 密码错误、文件损坏或版本不支持时，原账户保持完整 |

### 2.2 三条设计底线（硬约束）

1. 不提供默认明文导出，也不自行发明加密方案。
2. 恢复先合并，不直接覆盖全部账户。
3. "成功导出"不等于备份可靠，必须在独立测试环境里实际恢复一次。

## 3. 现状盘点（已核实）

- 依赖：`package.json` 已装 `crypto-js@^4.2.0`、`js-sha1@^0.7.0`。**加密库现成，无需新增依赖。**
- 页面：`pages/backup/backup.vue`、`pages/settings/settings.vue` 均为纯占位（点击弹"功能暂未开发"）。backup.vue 文案 "Backup and Sync / Sync Now" 暗示云同步，与"不做云同步"冲突，**需重写**。
- 导航：`pages.json` tabBar 已注册 Home/Backup/Settings 三个 tab，导航结构现成。
- 存储键：运行时账户存在 `uni.setStorageSync('accounts', …)`，键名 `'accounts'`，同步写入。home.vue 另有死代码 `saveAccountsToStorage/loadAccountsFromStorage/myfunc`（FileSystemManager 旧实现，未在主链路，后续清理时一并处理）。
- 账户字段：稳定字段 `id/icon/app/name/issuer/accountName/secret/algorithm/digits/period/pinned/sortOrder`；运行时字段 `code/countdown` **必须从备份中剔除**（每次重算，不属于账户数据）。
- 权限：`manifest.json` 的 Android 权限列表**没有**外部存储权限（READ/WRITE_EXTERNAL_STORAGE、MANAGE_EXTERNAL_STORAGE）。App 端写应用沙盒目录通常不需要；让用户选导出位置/选恢复文件依赖系统文件选择器（SAF），需真机验证 `uni.chooseFile` / `plus.io` 的实际行为。
- home.vue 顶部 `onImport/onExport/onHelp` 也是占位 toast，与 Backup tab 入口职责重叠，需在实现时理清入口归属（建议：备份与恢复统一放 Backup tab，home 顶部 import/export 按钮在功能路线第 5 项"导入导出"再启用，或与备份合并）。

## 4. 可行性调研

### 4.1 加密库

`crypto-js@4.2.0` 是纯 JavaScript 实现，uni-app App 原生运行时（V8 引擎）理论上可跑，但**是否真机可用需在真机跑一次最小用例验证**（标注为待验证）。它在 H5/小程序端通用。

候选方案对比：

| 方案 | 算法 | 完整性 | 跨端 | 新依赖 | 评估 |
|---|---|---|---|---|---|
| A | AES-256-CBC + PBKDF2 + HMAC-SHA256（Encrypt-then-MAC） | 有（HMAC） | 纯 JS，已装 | 无 | **推荐**。组合标准原语，不"发明"算法；EtM 提供机密性+完整性 |
| B | AES-256-GCM + PBKDF2 | 有（内置 tag） | 需 Web Crypto 或新库 | 可能需新依赖 | crypto-js **无原生 GCM**；Web Crypto（`crypto.subtle`）在 App 原生 runtime 是否可用**存疑**，待验证 |
| C | 只用 AES-CBC，不挂 HMAC | 无 | 纯 JS，已装 | 无 | 不达标——密文可被篡改且无法察觉，违反"文件损坏要明确处理" |

**推荐方案 A**：无新依赖、纯 JS 跨端最稳、提供机密性+完整性。代价是组合代码较多，必须用标准测试向量+往返测试覆盖。这不属于 security.md 禁止的"自行发明加密方案"——用的是 AES-CBC/PBKDF2/HMAC-SHA256 三个标准原语的成熟组合模式（类似 OpenSSL 早期 EVP 的 EtM），但**必须在实现时对照成熟实现做向量测试**。

> 待验证项 V1：crypto-js 在 uni-app App 真机运行时是否能正常加载与运算（H5/小程序理论上可，App 原生需实测）。
>
> **V1 结论（2026-10-27 真机已验证）**：crypto-js 加密/解密运算在 App 原生 runtime 可用，但 `crypto-js.lib.WordArray.random` 依赖 `window.crypto.getRandomValues`，App 原生 runtime **未暴露** `window.crypto`，导致随机数生成抛 "Native crypto module could not be used to get secure random number"。解决方案：核心模块 `backup-crypto.js` 重构为依赖注入 `options.randomBytes`，平台适配层 `platform-random.js` 注入 Android `java.security.SecureRandom` via Native.js（`reflect.Array.newInstance(Byte.TYPE, n)` + `sr.nextBytes` + 逐元素 `Array.get` 读取）。真机验证：`createBackup` 成功即证明 SecureRandom 链路 work。不可用抛 `NO_SECURE_RANDOM` 禁止导出（不降级 Math.random）。

### 4.2 Android 文件访问

- 写应用沙盒：`uni.saveFile` / `plus.io` 写 `_doc`/`_downloads` 子目录，通常不需外部存储权限。
- 选导出位置/选恢复文件：Android 用 SAF（系统文件选择器），`uni.chooseFile` 在 App 端的兼容性与返回的 `tempFilePaths` 行为需真机验证。
- 备份文件扩展名建议 `.mabak`（my-auth backup），便于识别与关联打开方式。

> 待验证项 V2：`uni.chooseFile`（或 `plus.io.chooseFile`）在 Android 真机选文件、读文件、写文件到用户选择位置的完整链路。
>
> **V2 结论（2026-10-27 真机已验证）**：放弃 `uni.chooseFile`，改用 Android SAF（`ACTION_CREATE_DOCUMENT`/`ACTION_OPEN_DOCUMENT`）via Native.js + `ContentResolver.openOutputStream/openInputStream` 直接读写 `content://` URI，不转文件路径、不加存储权限。真机已验证导出 667 字节写入 + 读回逐字节比对一致（verified），恢复端读到 667 字节 + openBackup 解密成功 + mergeAccounts 合并写回。**关键踩坑**（本机观测，非通则）：① `startActivityForResult(intent, code, jsFunction)` 三参数带 callback 版本在本机不触发回调，改两参数 + `Activity.onActivityResult` 覆盖 + `plus.android.importClass(data)`；② `plus.android.invoke(input, 'read', buf)`（read(byte[]) 带数组参数）静默失败返回 undefined（invoke 方法不存在/参数不匹配时返回 undefined 而非抛异常），改逐字节 `read()` 无参。详见 `.ai/plans/2026-10-26-saf-write-0kb-issue.md`（含故障过程与结论）。

## 5. 加密方案（方案 A 细则，待用户拍板）

- 口令派生：`PBKDF2-HMAC-SHA256`，盐 = `CryptoJS.lib.WordArray.random(16)`（128 bit），迭代次数 ≥ 100000，派生 256 bit 密钥 + 256 bit HMAC 密钥（或派生 512 bit 拆两半）。
- 对称加密：`AES-256-CBC`，IV = `CryptoJS.lib.WordArray.random(16)`，PKCS7 padding。
- 完整性：`HMAC-SHA256` over `(salt || iv || ciphertext)`，Encrypt-then-MAC。
- 恢复时先验 HMAC，**HMAC 不匹配一律按"密码错误或文件损坏"处理，绝不返回部分账户**。

## 6. 文件格式 v1

备份文件为 JSON（外层明文元数据 + 密文），扩展名 `.mabak`：

```json
{
  "format": "my-auth-backup",
  "version": 1,
  "kdf": { "alg": "PBKDF2-SHA256", "iterations": 100000, "salt": "<hex 32>" },
  "cipher": { "alg": "AES-256-CBC", "iv": "<hex 32>" },
  "mac": { "alg": "HMAC-SHA256", "value": "<hex 64>" },
  "ciphertext": "<hex|base64>",
  "meta": { "exportedAt": "<iso8601>", "accountCount": <n> }
}
```

- `meta` 在密文外（明文），仅含数量与时间，便于恢复预览显示"找到 N 个账户，导出于 X"，**不泄露账户内容**。
- `mac` 覆盖 `kdf/cipher/ciphertext` 元数据，防止篡改迭代次数/算法标识等字段。
- `version` 用于未来兼容：恢复时若 `version > 当前支持`，提示"备份版本过高，请升级应用"，不尝试降级解析。

## 7. 错误处理与边界

- **密码错误**：派生密钥错误 → HMAC 验证失败 → 提示"密码错误或备份文件已损坏"，不尝试解密、不返回部分数据。
- **文件损坏**：JSON 解析失败 / 字段缺失 / HMAC 不匹配 → 同上提示，原账户不动。
- **版本不支持**：`version` 高于本应用 → 提示升级应用，不降级解析。
- **恢复中途失败**：解密成功但合并前异常 → 不写入存储，原账户保持完整（合并是纯内存操作，持久化在最后一步 `persistAccounts` 成功后才更新内存，复用 home.vue 既有约定）。
- **空备份/空账户**：导出 0 个账户时明确提示并阻止（无意义的备份）；恢复 0 个账户时提示并终止。

## 8. 恢复合并策略

- 输入：现有 `accounts[]` + 备份解出的 `incoming[]`。
- 去重键：`secret`（小写归一）。同一密钥即同一账户（能生成相同验证码）。`issuer/accountName` 仅作展示。
- 默认策略 `skip`：重复项保留现有（保留现有的 `pinned/sortOrder` 等用户自定义），incoming 重复项进入"重复清单"展示给用户。
- 备选策略 `overwrite`：用 incoming 覆盖现有（仅在用户逐项确认时启用，第一版可只做 `skip`）。
- 返回结构：`{ merged: [...], duplicates: [{incoming, reason}], added: <n> }`。
- 合并是纯内存操作，最后一步才 `persistAccounts(merged)`，失败保留原状态（复用 home.vue 既有"先持久化成功再更新内存"约定）。

## 9. 备份状态

- 新增存储键 `'backup_meta'`：`{ lastExportAt, exportedCount, fingerprint }`。
- `fingerprint` = 账户集合稳定指纹（剔除 `code/countdown`，按 `secret` 排序后确定性哈希）。仅用于变更检测，不要求密码学强度。
- "导出后是否变更" = 当前指纹 ≠ 导出时指纹。
- 显示在 Backup tab：最近导出时间、导出账户数、是否有未备份变更。

## 10. 验证方式（对应底线 3）

- **单测**：加密→解密往返、密码错误拒绝、密文篡改拒绝（HMAC 失败）、字段缺失拒绝、版本过高拒绝、合并去重各路径、指纹稳定性与变更敏感性。
- **真机独立恢复**（最终验收）：导出 → 在独立测试环境（清空账户或独立设备）→ 恢复 → 确认账户回来。**"成功导出"不通过此项不算备份可靠。** 设计文档需在实施时给出安全操作步骤（避免误删真实账户）。

## 11. 分批实施计划

按既有"纯逻辑先抽离+单测 → 接入 → 真机回归"模式：

- **批次 A（已完成）**：`utils/backup-merge.js` 纯逻辑（序列化预处理、指纹、合并去重）+ `tests/backup-merge.test.mjs`（16 项）。
- **批次 B（已完成）**：`utils/backup-crypto.js` 加密模块（方案 A）+ `tests/backup-crypto.test.mjs`（16+3=19 项，含 Node crypto 独立对照）。`npm test` 62 项全通过。
- **V1（已完成，2026-10-27）**：随机源修复。`backup-crypto.js` 重构为依赖注入 `options.randomBytes`；新增 `platform-random.js`（Android SecureRandom via Native.js）；移除 Math.random 降级；不可用抛 `NO_SECURE_RANDOM` 禁止导出。真机验证 createBackup 成功。
- **V2（已完成，2026-10-27）**：SAF 文件 IO。新增 `platform-file.js`（`pickFileForSave`/`pickFileForRead`/`writeSafJsonVerified`）；onActivityResult 覆盖写法；逐字节 write(int)/read() 绕开数组参数桥接。真机验证导出 667 字节 verified + 恢复解密 + 合并写回 + home onShow 重载。
- **批次 C（待开工）**：正式 `backup.vue` UI（创建备份用真实账户与用户输入密码 / 恢复预览 / 合并恢复确认 / 备份状态），替换当前验证页；导出改读真实 `accounts` 存储（当前硬编码 `testAccount()`）；UI 明示"密码无法找回"。
- **批次 D（待测）**：真机回归收尾——错误密码拒绝（应报 PASSWORD_OR_CORRUPT）、用户取消另存为/选择文件（应标 cancelled 不报成功）、原账户不变确认。
- **批次 E（清理）**：删除 home.vue 死代码 `saveAccountsToStorage/loadAccountsFromStorage/myfunc`、旧 `utils/finial.js`、实验性文件（与 HANDOFF §6 清理项合并）。

## 12. 已实现批次

**批次 A（2026-10-26 晚，已通过）**
- `.ai/plans/2026-10-26-encrypted-backup.md`（本文件）：设计与可行性。
- `utils/backup-merge.js`：合并去重纯逻辑（serializeForBackup/buildDuplicateKey/buildAccountFingerprint/mergeAccounts，skip 策略）。
- `tests/backup-merge.test.mjs`：16 项单测。

**批次 B（2026-10-26 晚，已通过）**
- `utils/backup-crypto.js`：AES-256-CBC + PBKDF2-HMAC-SHA256(100000) + HMAC-SHA256(EtM)；`createBackup`/`openBackup` + `BackupError`；MAC 覆盖 header+ciphertext 恒定时间比较；派生 512bit 拆 encKey/macKey；关键坑已规避（PBKDF2 显式 iterations、AES 传 WordArray key 不传字符串）。
- `tests/backup-crypto.test.mjs`：16 项（往返、剔除运行时字段、错密码/篡改 ciphertext/mac/iv/salt/iterations 拒绝、版本/格式拒绝、JSON 损坏、空备份拒绝、meta、随机性、JSON 入参、Node crypto 独立对照解密+验 MAC）。
- `npm test` 59 项全通过（exit 0；耗时约 67s，因 PBKDF2 十万次迭代 × 16 用例，属预期）。

**未开工**：批次 C（正式 backup.vue UI）、D（错密码/取消/原账户不变收尾）、E（清理死代码）。

## 12b. V1/V2 真机验证记录（2026-10-27）

**V1 随机源**：
- 现象：crypto-js `WordArray.random` 在 App 原生 runtime 抛 "Native crypto module could not be used to get secure random number"（App 端无 `window.crypto`）。
- 解决：backup-crypto.js 重构为依赖注入 `options.randomBytes`；新增 platform-random.js（Android `java.security.SecureRandom` via Native.js：`reflect.Array.newInstance(Byte.TYPE, n)` + `sr.nextBytes` + `Array.get` 逐元素读取，`(b+256)%256` 处理 Java byte 有符号）。
- 验证：createBackup 成功（单次 PBKDF2 约 2.7s）即证明 SecureRandom 链路 work。不可用抛 NO_SECURE_RANDOM 禁止导出。

**V2 SAF 文件 IO**：
- 导出端：ACTION_CREATE_DOCUMENT → ContentResolver.openOutputStream → BufferedOutputStream → 逐字节 write(int) → flush → close → openInputStream → 逐字节 read() 读回比对（verified）。真机 667 字节 verified 通过，真实 IO 约 1.1s。
- 恢复端：ACTION_OPEN_DOCUMENT → ContentResolver.openInputStream → 逐字节 read() 无参 → utf8Decode（优先 TextDecoder，fallback 手写 UTF-8）。真机读到 667 字节，openBackup 解密成功，mergeAccounts 合并写回，home onShow 重载显示恢复账户。
- 关键踩坑（本机观测，非通则）：
  1. `startActivityForResult(intent, code, jsFunction)` 三参数带 callback 版本在本机（HBuilderX 5.26 + 5+ Runtime）不触发回调；改两参数 + `Activity.onActivityResult = function(...)` 覆盖 + `plus.android.importClass(data)`。未在其他 runtime 版本验证。
  2. `plus.android.invoke(input, 'read', buf)`（read(byte[]) 带数组参数）静默失败返回 undefined（invoke 方法不存在/参数不匹配时返回 undefined 而非抛异常，"没抛错≠成功"）；改逐字节 `read()` 无参（导出端 verify 已验证此法 work）。不排除其他方法/参数组合另有表现。
- 性能：667 字节逐字节 write 约 0.5s + verify 约 0.5s + 恢复 read 约 0.65s，真实 IO 约 1.6s，可接受，无需优化批量读写。页面显示"IO 8870ms"含用户在系统对话框选位置的约 7.2s。

**验证页限制**：
- 导出硬编码 `testAccount()`（Acme/alice/JBSWY3DPEHPK3PXP），不读真实 accounts 存储——验证加密往返，不验证真实数据导出。
- 恢复按钮 4"恢复并写回存储"会修改 accounts 存储读取失败已加防御（立即终止不写回）。
- 未测：错误密码拒绝、用户取消、原账户不变（批次 D）。

## 13. 拍板结果（2026-10-26 晚）

1. **加密方案**：方案 A（AES-256-CBC + PBKDF2-SHA256 + HMAC-SHA256，crypto-js，无新依赖）。用户确认选 crypto-js；补充说明之前手写 TOTP 算法是为三端兼容，crypto-js 纯 JS 三端可用。
2. **PBKDF2 迭代次数**：100000（显式指定；crypto-js 默认 1 是坑）。
3. **合并策略**：第一版只做 `skip`（保留现有 pinned/sortOrder），不做 overwrite。方便测试，后续按需加。
4. **入口归属**：备份/恢复放 Backup tab；home 顶部 import/export 按钮暂不动（留给后续"导入导出"功能）。
5. **密码遗忘说明**：UI 明示"密码无法找回"。
6. **恢复验收方式**：最简方案（选文件→输密码→预览数量→确认→skip 合并→完成）；真机独立恢复验收待批次 D。

## 14. 后续功能需求整理（仅整理，不在本会话开发）

按用户给出的顺序，仅列需求点供后续逐项展开：

1. **加密备份与恢复**（本文件）。
2. **手动添加与编辑账户**：手动录入 secret/issuer/accountName/digits/period（需校验 Base32、参数范围，复用 otpauth/account 模块）；编辑现有账户（当前 `onEditAccount` 是占位 toast，`pages/other/edit-account.vue` 已存在但未接入导航）。
3. **首页视觉改版与深色模式**：基于已完整操作流程统一设计（settings.vue 已有 Dark Mode 开关占位）；图标统一（conventions.md 要求"不继续用表情符号充当正式图标"，home.vue 当前 ❓📥📤＋ 是表情）。
4. **本地密钥保护与应用锁**：作为公开推荐他人使用前的重要一轮；密钥保护考虑 Android Keystore/iOS Keychain 与不支持平台降级（security.md）；应用锁≠密钥加密本身。

## 15. 风险与处理

- crypto-js 真机不可用：批次 B 第一步即跑最小加密用例，失败则评估 Web Crypto 或换库。
- 文件 IO 链路在 Android 11+ scoped storage 下行为：批次 C 真机验证，必要时回退到应用沙盒目录 + 用户手动复制。
- 旧账户无 `pinned/sortOrder`：合并与备份序列化复用 `normalizeAccount`，已有迁移逻辑，不导致账户消失。
- 合并去重键选 `secret`：若用户故意为同一密钥建多个标签账户，恢复时会被识别为重复——`skip` 默认保留现有，不丢数据；但需在 UI 列出重复项让用户知晓。
