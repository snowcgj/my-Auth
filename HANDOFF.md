# my-Auth 项目 Handoff（2026-10-27）

> 本文件供下一次会话快速接续工作。新会话的 AI 无历史上下文，请先读本文件，再按"启动指引"读取项目内文档。

## 1. 项目一句话

my-Auth：uni-app + Vue 3 的本地 TOTP 二次验证器（类 Google Authenticator），离线优先、密钥安全、跨端一致。当前**只以 Android 真机为验收端**；微信小程序与 H5 暂缓验证但不删跨端代码。

## 2. 关键路径

- 项目根：仓库根目录；内层 uni-app 应用在 `my-auth/`（HBuilderX 打开这一层）
- HBuilderX 5.26 + "App真机运行"插件，USB 真机调试可用
- AI 规范入口：根目录 `AGENTS.md`；项目专属背景/架构/约定/安全在 `.ai/`；计划在 `.ai/plans/`、决策在 `.ai/decisions/`
- 测试：`cd my-auth/my-auth && npm test`（Node 内置 `node:test`，不引入 Vitest）

## 3. 当前状态

- **最新提交**：见 `git log --oneline -3`（本次阶段存档含代码与文档两次提交）
- **测试**：`cd my-auth/my-auth && npm test` → **73 项通过**（totp-core 9 + otpauth 10 + account 8 + backup-merge 16 + backup-crypto 30，含 Node crypto 独立对照 + 参数校验防御 + spy 验证不执行派生），耗时约 81s（PBKDF2 十万次迭代）
- **已完成**：
  - 第一批稳定性重构 + 核心体验（搜索/复制/置顶/删除确认）+ 评审修订批，Android 真机核心流程回归通过
  - **加密备份最小验证链路（2026-10-26 ~ 10-27）**：加密核心 + 合并逻辑 + 平台适配（SecureRandom + SAF）+ 真机验证页跑通。详见 `.ai/plans/2026-10-26-encrypted-backup.md` 与 `.ai/decisions/2026-10-26-encrypted-backup.md`
  - **批次 C 正式 UI（2026-10-27，真机验收通过）**：`backup.vue` 重写为正式备份与恢复流程（密码二次确认、恢复预览、确认合并、读取失败防御、防重复操作、1MB 文件上限、备份状态展示）；`backup-crypto.js` 加参数校验（password 类型、iterations 精确接受 100000、salt/iv 字节数）；`platform-file.js` 加防重复操作 + 大小上限统一命名。8 项 Android 真机测试全部通过。
- **逻辑模块**（纯逻辑，运行时不依赖 `uni.*`/Node `Buffer`/`crypto`）：
  - `utils/totp-core.js`：RFC 6238 TOTP，`generateTOTP({secret, timestampSeconds, digits, period, algorithm})`，仅 SHA1、digits 6/8、period 30/60
  - `utils/otpauth.js`：`parseOtpAuthUri(uri)`，参数按名读取+URL 解码，拒绝 HOTP/SHA256/SHA512
  - `utils/account.js`：`normalizeAccount(account)`，保留未知字段、仅缺失补默认
  - `utils/backup-merge.js`：`serializeForBackup`/`buildDuplicateKey`/`buildAccountFingerprint`/`mergeAccounts`（skip 策略）
  - `utils/backup-crypto.js`：`createBackup`/`openBackup`，依赖注入 `options.randomBytes`；核心不碰平台 API
- **平台适配模块**（App 原生 runtime 专用，通过 Native.js 桥接 Java）：
  - `utils/platform-random.js`：`getRandomBytes(n)`，Android 走 `java.security.SecureRandom`，其他走 Web Crypto，不可用抛 `NO_SECURE_RANDOM`
  - `utils/platform-file.js`：`pickFileForSave`/`pickFileForRead`/`writeSafJsonVerified`，Android 走 SAF（`ACTION_CREATE/OPEN_DOCUMENT` + `ContentResolver`），逐字节 `write(int)`/`read()` 绕开数组参数桥接问题
- **页面/组件**：
  - `pages/home/home.vue`：账户列表、扫码、增删、本地存储；`onShow` 重载 accounts（任何存储变更切回首页即反映）
  - `pages/backup/backup.vue`：**正式备份与恢复流程**（批次 C 代码完成，待真机验收）。创建备份读真实 accounts + 密码二次确认 + SAF 导出读回一致才写 backup_meta；恢复选文件→输密码→解密预览新增/重复→确认才合并→写入前重新读取现有账户；默认 skip 重复；读取失败/取消/错密码/损坏/写入失败均不改原账户；busy 防重复；不记录密码/账户/完整 URI
  - `components/AccountItem.vue`：`<text>⋮</text>` 替代 `<uni-icons>`（消除每秒告警）
- **旧实现**：`utils/finial.js` 已被取代、未被主链路引用，暂未删除（待清理）

## 4. 必须遵守的约定（写代码前看）

- **持久化**：账户状态单一来源；增删置顶"先 `persistAccounts(next)` 成功再赋值 `this.accounts` + 提示，失败保留原状态并报错"；不用深度 watcher 自动保存；`loadAccounts()` 读取不回写、失败置空不覆盖。
- **恢复写回**（验证页已实现，正式功能沿用）：读取现有账户失败**立即终止**，不按空数组继续合并（否则覆盖原存储）；解密/合并/写回任一步失败则存储不变。
- **uni-app App 真机踩坑**（本机观测，非框架通则）：
  1. 子组件 `<input>` 不用 v-model 驱动计算属性过滤（用 `:value`+`@input`）。
  2. 依赖 props 初始化的逻辑放 `mounted()` 不放 `created()`（原因待定位）。
  3. `<button @click>`/`<view @click>` 可靠；点击无反应先排查方法因状态为空静默 return。
- **安全**：不记录完整 secret/账户/二维码原文；调试日志只用账户 ID/阶段/错误类型；仓库只用公开演示密钥 `JBSWY3DPEHPK3PXP`。
- **算法**：不擅自替换通过 RFC 6238 标准向量的手写 HMAC-SHA1；算法改动必须有自动测试。
- **跨端**：保留微信小程序/H5 代码与配置，当前只验收 Android；不以 Node `Buffer`/`crypto` 替换通用实现。

## 5. 诚实标注（技术纪律）

- 明确区分「已验证 / 推断 / 待验证」；**文件已写入 ≠ 软件已加载/真机已验证**。
- 本机观测到的现象（如 Native.js 桥接行为）记录时标注测试背景（机型/runtime 版本），不写成框架通则。
- 验证页通过 ≠ 正式功能完成。

## 6. 未完成 / 后续待办

**加密备份（批次 C/D 已完成，异常用例可选补测）**
- 批次 C 真机验收通过（8 项测试全部通过），批次 D 收尾（错密码/取消/原账户不变）已随批次 C 真机验收合并完成。
- 尚未覆盖的异常用例（可选）：1MB 上限拒绝（需大文件）、backup_meta 写失败分别说明（需模拟存储失败）、存储损坏检测（需模拟外部篡改）、恢复后备份状态刷新（已实现未真机验证）。

**清理**
- 删除旧 `utils/finial.js`（确认无引用后）；清理 home.vue 死代码 `saveAccountsToStorage/loadAccountsFromStorage/myfunc`；清理实验性/未用文件。

**真机用例补测**
- 参数乱序、URL 编码账户名、digits=8/period=60、应被拒绝（HOTP/SHA256）的二维码。

**后续功能路线**
1. 加密备份正式 UI（批次 C/D）
2. 手动添加与编辑账户
3. 视觉改版 + 深色模式
4. 本地密钥保护 + 应用锁

**待定位**
- `created` vs `mounted` 真机差异的真实机制。

## 7. 新会话启动指引

1. 读：`AGENTS.md` → `.ai/project.md` → `.ai/architecture.md` → `.ai/conventions.md` → `.ai/security.md`。
2. 读加密备份相关：`.ai/plans/2026-10-26-encrypted-backup.md`（设计+进度）→ `.ai/decisions/2026-10-26-encrypted-backup.md`（技术取舍）→ `.ai/plans/2026-10-26-saf-write-0kb-issue.md`（SAF 故障过程与结论）。
3. 跑 `cd my-auth/my-auth && npm test` 确认 62 项基线通过。
4. 用 HBuilderX 打开 `my-auth/`，USB 真机运行确认基线可用。
5. 与用户对齐本次要做什么，再动代码。

## 8. 本会话脉络（简）

基线 `0b27c16`（27 项测试）→ 加密备份设计拍板 → 批次 A（backup-merge 纯逻辑+16 单测）→ 批次 B（backup-crypto 加密核心+19 单测，含 Node crypto 对照）→ V1 真机：crypto-js App 端无 window.crypto，重构为依赖注入+platform-random（Android SecureRandom）→ V2 真机：SAF 写文件反复 0kb，求助 GPT 后定位（startActivityForResult 三参数不触发回调→两参数+onActivityResult 覆盖；read(byte[]) 静默失败→逐字节 read()）→ 验证页跑通导出 667 字节 verified + 恢复解密 + 合并写回 + home onShow 重载 → 加按钮 4"恢复并写回存储"→ 修读取失败防御 → 阶段存档。

## 9. 环境

- Node：系统 `v22.11.0`（npm `10.9.2`）；Git `2.55.0`。
- HBuilderX 5.26 + "App真机运行"插件。
- Android 真机：USB 调试，扫码用公开密钥 `JBSWY3DPEHPK3PXP` 的二维码。
- 无微信开发者工具、Java、全局 ADB 或 Android SDK 环境变量（暂不需要）。
