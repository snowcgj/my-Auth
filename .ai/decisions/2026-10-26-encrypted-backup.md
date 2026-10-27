# 加密备份技术决策（2026-10-26）

- 状态：**已确认**（V1+V2 真机最小验证通过，正式 UI 待完成）
- 相关：设计文档 `.ai/plans/2026-10-26-encrypted-backup.md`；SAF 故障过程 `.ai/plans/2026-10-26-saf-write-0kb-issue.md`

## 背景

换机、卸载或设备损坏后需要找回账户。优先级排在编辑、手动添加、界面改版之前——账户一旦丢失，界面和操作都帮不上忙。需求：本地加密文件备份与恢复，不含账号系统、云同步、明文导出。三条硬约束：①不提供明文导出、不自行发明加密方案；②恢复先合并不直接覆盖；③"成功导出"必须在独立环境实际恢复一次才算可靠。

## 决策 1：加密方案选 AES-256-CBC + PBKDF2 + HMAC-SHA256（Encrypt-then-MAC）

**备选**：
- A：AES-256-CBC + PBKDF2-HMAC-SHA256 + HMAC-SHA256(EtM)，用已装的 crypto-js@4.2.0，无新依赖。
- B：AES-256-GCM + PBKDF2，完整性内置 tag。但 crypto-js 无原生 GCM；Web Crypto（`crypto.subtle`）在 App 原生 runtime 是否可用存疑（后经 V1 验证：App 端无 `window.crypto`，证实不可用）。
- C：只用 AES-CBC 不挂 HMAC。密文可被篡改且无法察觉，违反"文件损坏要明确处理"。

**决定**：选 A。用三个标准原语的成熟组合模式（类似 OpenSSL 早期 EVP 的 EtM），不属于"自行发明加密方案"。机密性（AES-CBC）+ 完整性（HMAC EtM，先验 MAC 再解密）+ 恒定时间比较。

**代价/限制**：
- 组合代码较多，必须用标准测试向量 + 往返测试覆盖（已写 19 项单测含 Node crypto 独立对照）。
- PBKDF2 单次派生约 2.7s（十万次迭代），用户体验上需提示"加密中"。
- 派生 512bit 拆 encKey(256)+macKey(256)；AES 传 WordArray key 不传字符串（避免 crypto-js 内部再派生）。
- PBKDF2 显式指定 iterations=100000（crypto-js@4.2.0 默认 250000；我们用 100000 平衡移动端性能，单次约 2.7s）。

## 决策 2：随机源用依赖注入 + 平台适配层（Android SecureRandom）

**备选**：
- 用 crypto-js 的 `WordArray.random`（依赖 `window.crypto.getRandomValues`）。
- 自己写 `randomWordArray` 降级 Math.random。
- 核心模块依赖注入 `options.randomBytes`，平台适配层注入安全源。

**决定**：选依赖注入。核心 `backup-crypto.js` 接受 `options.randomBytes`（返回 WordArray），平台适配层 `platform-random.js` 注入：Android 走 `java.security.SecureRandom` via Native.js，其他走 Web Crypto，不可用抛 `NO_SECURE_RANDOM` 禁止导出。

**原因**：V1 真机验证发现 App 原生 runtime 无 `window.crypto`，crypto-js 随机数 API 不可用。Math.random 不满足密码学强度，不能用于盐/IV 生成。依赖注入让核心保持可测试（Node 单测注入固定随机源验证确定性），平台适配层隔离 Native.js 细节，核心不散落 Android API。

**代价/限制**：
- 调用方必须注入随机源，否则抛错禁止导出（不降级）。
- Android SecureRandom via Native.js 的实现较繁琐（`reflect.Array.newInstance(Byte.TYPE, n)` + `sr.nextBytes` + 逐元素 `Array.get` + `(b+256)%256` 处理有符号 byte），但真机已验证 work。

## 决策 3：文件 IO 用 Android SAF + ContentResolver 直接读写 content:// URI

**备选**：
- `uni.chooseFile` / `plus.io.chooseFile`。
- 应用沙盒目录（`_doc`/`_downloads`）+ 用户手动复制。
- Android SAF（`ACTION_CREATE/OPEN_DOCUMENT`）+ `ContentResolver.openOutputStream/openInputStream`。

**决定**：选 SAF。通过 Native.js 桥接 Java，直接读写 `content://` URI，不转文件路径、不加存储权限（READ/WRITE_EXTERNAL_STORAGE）、不以系统分享主导出。

**原因**：SAF 让用户在系统文件选择器选位置/选文件，符合"用户控制备份位置"的体验；不申请全盘存储权限符合 Android 11+ scoped storage 趋势；不转文件路径避免权限/路径转换问题。

**代价/限制**（本机观测，非通则）：
- `startActivityForResult(intent, code, jsFunction)` 三参数带 callback 版本在本机（HBuilderX 5.26 + 5+ Runtime）不触发回调；改两参数 + `Activity.onActivityResult` 覆盖 + `plus.android.importClass(data)`。**未在其他 runtime 版本验证**。
- `plus.android.invoke(input, 'read', buf)`（read(byte[]) 带数组参数）静默失败返回 undefined（invoke 方法不存在/参数不匹配时返回 undefined 而非抛异常，"没抛错≠成功"）；改逐字节 `read()` 无参 + `utf8Decode`。**不排除其他方法/参数组合另有表现**。
- 逐字节读写性能：667 字节真实 IO 约 1.6s，可接受；更大文件未测。
- 仅在 Android 验证；微信小程序/H5 的文件 IO 需另行适配（当前不验收）。

## 决策 4：合并策略第一版只做 skip

**备选**：
- skip：重复项保留现有（保留 pinned/sortOrder），incoming 重复项进清单展示。
- overwrite：用 incoming 覆盖现有（需用户逐项确认）。

**决定**：第一版只做 skip。

**原因**：skip 不会丢失现有自定义（pinned/sortOrder），语义清晰；overwrite 在策略语义未与用户充分对齐前引入风险。去重键选 secret（小写归一）——同一密钥生成相同验证码即同一账户；issuer/accountName 仅作展示。

**代价/限制**：若用户故意为同一密钥建多个标签账户，恢复时会被识别为重复——skip 默认保留现有不丢数据，但需在 UI 列出重复项让用户知晓。

## 决策 5：PBKDF2 迭代次数 100000

**备选**：更高（如 600000，OWASP 2023 建议）vs 100000 vs 更低。

**决定**：100000。

**原因**：平衡安全性与移动端用户体验。单次派生约 2.7s（真机实测），用户可接受。低于 crypto-js@4.2.0 默认 250000（为控制移动端性能，250000 约需 6.7s），但远高于不安全的低迭代值。未来硬件提速后可调高，文件格式 v1 的 `kdf.iterations` 字段支持每文件独立指定，恢复时按文件实际值派生。

## 决策 6：文件格式 v1 明文元数据 + 密文

**决定**：JSON 外层明文元数据（`format`/`version`/`kdf`/`cipher`/`mac`/`meta`）+ 密文 `ciphertext`。MAC 覆盖 header（format/version/kdf/cipher）+ ciphertext，恒定时间比较。

**原因**：`meta`（exportedAt/accountCount）在密文外，便于恢复预览显示"找到 N 个账户，导出于 X"而不泄露账户内容；MAC 覆盖 header 防止篡改迭代次数/算法标识；`version` 支持未来兼容（恢复时 version > 当前支持则提示升级，不降级解析）。

**代价/限制**：accountCount 与 exportedAt 在明文，理论上泄露"备份规模与时间"——可接受（不泄露账户内容）。

## 影响汇总

- **架构**：新增纯逻辑层（backup-merge/backup-crypto）+ 平台适配层（platform-random/platform-file），核心不碰平台 API，可 Node 单测。
- **测试**：`npm test` 从 27 项升至 62 项（含 Node crypto 独立对照）。
- **跨端**：仅 Android 验证；微信小程序/H5 的 SecureRandom 与 SAF 需另行适配。
- **正式功能未完成**：当前为最小真机验证页（固定测试密码、演示账户、硬编码 testAccount 导出），正式 UI（用户输入密码、恢复预览、合并确认、备份状态、导出读真实账户）待批次 C。
