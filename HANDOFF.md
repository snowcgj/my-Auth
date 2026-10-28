# my-Auth 项目 Handoff（2026-10-28）

> 本文件供下一次会话快速接续工作。新会话的 AI 无历史上下文，请先读本文件，再按"启动指引"读取项目内文档。

## 1. 项目一句话

my-Auth：uni-app + Vue 3 的本地 TOTP 二次验证器（类 Google Authenticator），离线优先、密钥安全、跨端一致。当前**只以 Android 真机为验收端**；微信小程序与 H5 暂缓验证但不删跨端代码。

## 2. 关键路径

- 项目根：仓库根目录；内层 uni-app 应用在 `my-auth/`（HBuilderX 打开这一层）
- HBuilderX 5.26 + "App真机运行"插件，USB 真机调试可用
- AI 规范入口：根目录 `AGENTS.md`；项目专属背景/架构/约定/安全在 `.ai/`；计划在 `.ai/plans/`、决策在 `.ai/decisions/`
- 测试：`cd my-auth/my-auth && npm test`（Node 内置 `node:test`，不引入 Vitest）

## 3. 当前状态

**最新阶段：发布材料审阅（2026-10-28）**：用户确认芝码使用、GitHub迁移与备份收尾已正常，并同意 MIT 和公开演示截图。README 已按使用者优先重整，新增 LICENSE、v1.0.1 说明及独立 SHA256SUMS，docs/android-release.md 更新到真实打包状态；补充云端排队、SDK渠道、AppKey/签名成本。三张新截图 githubpic/zhima-*.png 来自实际Vue组件与公开数据，93项DOM检查通过，设置模拟版本修正为1.0.1；不是Android真机截图。本轮先完成审阅和检查，未执行提交/推送/标签/Release。APK不需因文档更新重打包。详见 .ai/plans/2026-10-28-release-docs.md。

**本地 Android 工具链（2026-10-27）**：用户授权集中放置于 E:/AndroidBuild-myAuth，便于以后删除。JDK17/Gradle8.14.3/SDK36/BuildTools35+36/ADB 已安装并验证；独立原生测试 APK 实际构建和签名核验通过，非 Auth。无全局环境改动；约2.9GiB，使用与清理见该目录 README/VERIFICATION。匹配5.26的 DCloud 离线 SDK 需用户下载，后续仍要接入原生工程、AppKey和生产签名；不能宣称 Auth 本地 APK 已完成。工具与缓存均在仓库外，不提交它们。

**品牌更新（2026-10-27，原生待验）**：用户确认显示名“芝码”，已接入紫色小门/芝麻钥匙孔图标和原生 NinePatch 启动画面，版本 1.0.1(101)。沿用 io.github.snowcgj.myauth、DCloud appid 和云证书，覆盖本次 Auth 版本，2024 年旧版独立保留。源码在 static/branding/zhima，生成器 scripts/generate-brand-assets.mjs；13 PNG 检查、三密度 aapt2 编译、14 SFC、93 模拟 DOM 检查和 HBuilderX 生产资源导出通过。待新 APK 提取图标与冷启动验收；README 重整和 GitHub 发布后置。本轮未提交或推送。见 .ai/plans/2026-10-27-zhima-brand.md 与对应 decisions。

**此前发布结果**：21:06 云端任务已成功，Auth 1.0.0 APK 下载至 unpackage/release/apk，用户安装可用，但图标空白。已证实旧图标生成器未指定 drawImage 目标尺寸，小图仅截得背景；新生成器显式缩放并逐张检查。此前 camera/autofocus uses-feature 重复失败也已修复，不再手工声明这些 feature。不要重新安装 2024 年的 myauth.apk。

**最新 APK（2026-10-28 核查）**：芝码 1.0.1 云任务已于昨晚23:53:36成功，本地 unpackage/release/apk/Zhima-1.0.1-20261027.apk（复制自 __UNI__1835605__20261027224716.apk），15473895字节。aapt2确认芝码/1.0.1(101)/io.github.snowcgj.myauth，签名核验通过且与上一云包一致；最终APK提取四密度图标均有图案，192px目视通过。SHA256 CB5B87BCE606DAC797407FC42CA9C30F6963DE94F7428DE18D7F05DE52235DC8。待用户覆盖安装验收桌面/冷启动/账户保留，再整理README和GitHub发布。README须客观补充DCloud云端排队、离线SDK下载/AppKey/签名的维护成本，用户已明确要求。

**最新批次：背景主题与 README（阶段存档）**：基于 23d7a06 实现首页调色板入口、暖白/雾紫/浅绿配色，三页和页面内弹层统一；独立 ui-theme 偏好，保存失败不切换，不触碰账户与备份。126 项测试（新增 theme 4 项）、14 个 SFC 检查、93 项模拟浏览器交互检查通过。README 已重写，3 张图为公开演示浏览器截图；README.draft 与 theme-prep 保留。Android 重启恢复、短屏与原生暖白露底待验；许可证未决定，未打包或发布。用户已授权本轮本地提交，不推送；提交号见 git log。见 .ai/plans/2026-10-27-background-themes.md 和对应 decisions。

**当前批次：展示名称编辑（阶段存档）**：用户授权实现“只修改服务名和账户名”，暂不做手动添加，不安排 APK 打包。基于已提交的 44b5048（SHA2 与系统选图，用户反馈测试可用）增加编辑面板；只改 app/name，保留原始标识/密钥/配置，失败保留草稿。名称纳入 v2 备份指纹，旧记录提示重新备份一次，不改备份文件格式或恢复去重规则。122 项测试、13 个 SFC 检查、58 项模拟浏览器交互检查通过，Android 键盘与新流程待验。详见 .ai/plans/2026-10-27-account-names.md 与对应 decisions。用户已授权本轮本地提交，不推送；提交号见 git log。

下列早期记录保留当时背景，验收状态以本段及对应计划最新记录为准。

- **最新提交**：见 `git log --oneline -3`（本轮实现基线为 44b5048）
- **测试**：在内层应用目录运行 `npm test` → **126 项通过**（totp-core 27 + otpauth 11 + account 11 + backup-merge 23 + backup-crypto 31 + platform-io 16 + backup-summary 3 + theme 4），约 79 秒。新增平台测试模拟 Java/Activity，不替代真机。
- **已完成**：
  - **统一弹窗与等待反馈（2026-10-27，本地验证完成、真机待验）**：AppDialog/AppToast/BusyOverlay，删除确认与设置说明/隐私不再用系统弹窗，复制提示统一；备份先提交反馈并让出短任务再同步计算，finally 释放 busy、卸载后令牌失效。73 项测试、12 个 SFC 检查、27 项 DOM 检查、8 组模拟备份场景通过。实际加载动画/SAF 返回需真机复验，未迁移线程；见 `.ai/plans/2026-10-27-feedback-ui.md`。
  - **视觉与导航改版（2026-10-27，代码完成、真机待验）**：用户确认原型后接入暖白/淡紫首页、服务图标、底部操作面板、设置与备份分步界面；移除 Tab，保留三页注册，使用 navigateTo/navigateBack。首页 onShow 启动时钟并重载，onHide/onUnload 停止。核心算法、备份协议、SAF 不变。73 项测试与 Vue SFC 检查通过；浏览器交互检查为模拟 uni API，不能替代 Android。下一步先按 `.ai/plans/2026-10-27-ui-refresh.md` 真机验收。
  - 第一批稳定性重构 + 核心体验（搜索/复制/置顶/删除确认）+ 评审修订批，Android 真机核心流程回归通过
  - **加密备份最小验证链路（2026-10-26 ~ 10-27）**：加密核心 + 合并逻辑 + 平台适配（SecureRandom + SAF）+ 真机验证页跑通。详见 `.ai/plans/2026-10-26-encrypted-backup.md` 与 `.ai/decisions/2026-10-26-encrypted-backup.md`
  - **批次 C 正式 UI（2026-10-27，真机验收通过）**：`backup.vue` 重写为正式备份与恢复流程（密码二次确认、恢复预览、确认合并、读取失败防御、防重复操作、1MB 文件上限、备份状态展示）；`backup-crypto.js` 加参数校验（password 类型、iterations 精确接受 100000、salt/iv 字节数）；`platform-file.js` 加防重复操作 + 大小上限统一命名。8 项 Android 真机测试全部通过。
- **逻辑模块**（纯逻辑，运行时不依赖 `uni.*`/Node `Buffer`/`crypto`）：
  - `utils/totp-core.js`：RFC 6238 TOTP，`generateTOTP({secret, timestampSeconds, digits, period, algorithm})`，SHA1/SHA256/SHA512、digits 6/8、period 30/60；默认 SHA1
  - `utils/otpauth.js`：`parseOtpAuthUri(uri)`，参数按名读取+URL 解码，接受三种算法，拒绝 HOTP 和未知算法
  - `utils/account.js`：`normalizeAccount(account)`、`renameAccount`、`validateAccountNames`，保留未知字段、仅缺失补默认；编辑只覆盖展示名称
  - `utils/backup-merge.js`：`serializeForBackup`/`buildDuplicateKey`/`buildAccountFingerprint`/`mergeAccounts`（skip 策略）
  - `utils/backup-crypto.js`：`createBackup`/`openBackup`，依赖注入 `options.randomBytes`；核心不碰平台 API
- **平台适配模块**（App 原生 runtime 专用，通过 Native.js 桥接 Java）：
  - `utils/activity-result.js`：原生选择器共享结果入口、单一 pending 互斥，未知结果转交已有可调用处理器；只有这里赋值 onActivityResult。
  - `utils/platform-image.js`：系统选图 → Java Channels/ByteBuffer 复制到本次缓存 → plus.barcode.scan → 清理；20MiB 上限，原生待验；manifest 已显式声明 Barcode。
  - `utils/platform-random.js`：`getRandomBytes(n)`，Android 走 `java.security.SecureRandom`，其他走 Web Crypto，不可用抛 `NO_SECURE_RANDOM`
  - `utils/platform-file.js`：`pickFileForSave`/`pickFileForRead`/`writeSafJsonVerified`，Android 走 SAF（`ACTION_CREATE/OPEN_DOCUMENT` + `ContentResolver`），逐字节 `write(int)`/`read()` 绕开数组参数桥接问题
- **页面/组件**：
  - `pages/home/home.vue`：账户列表、扫码、增删、本地存储；`onShow` 重载 accounts（任何存储变更切回首页即反映）
  - `pages/backup/backup.vue`：正式备份与恢复流程（改版前批次 C 已真机验收；本轮视觉/导航调整待重新验收）。创建备份读真实 accounts + 密码二次确认 + SAF 导出读回一致才写 backup_meta；恢复选文件→输密码→解密预览新增/重复→确认才合并→写入前重新读取现有账户；默认 skip 重复；读取失败/取消/错密码/损坏/写入失败均不改原账户；busy 防重复；不记录密码/账户/完整 URI
  - `components/AccountItem.vue`：Composition API；监听窗口和配置，无独立时钟；服务本地图标/首字符回退、6/8 位分组与复制、倒计时环，更多操作交由首页 ActionSheet。首次 props 与设备适配待真机复验。
- **旧实现**：`utils/finial.js` 已被取代、未被主链路引用，暂未删除（待清理）

## 4. 必须遵守的约定（写代码前看）

- **持久化**：账户状态单一来源；增删置顶"先 `persistAccounts(next)` 成功再赋值 `this.accounts` + 提示，失败保留原状态并报错"；不用深度 watcher 自动保存；`loadAccounts()` 读取不回写，失败保留已有内存、显示错误并隐藏账户操作，不按空数组回写。
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
- 删除旧 `utils/finial.js`（确认无引用后）；清理实验性/未用文件。home.vue 的旧 FileSystemManager 死代码已随本轮页面改版移除；旧资源与实验文件未删除。

**真机用例补测**
- 参数乱序、URL 编码账户名、digits=8/period=60、SHA256/SHA512、应被拒绝（HOTP/SHA384）的二维码；以及新算法备份恢复/重启保留。

**后续功能路线**
用户已确认视觉、弹窗/等待反馈与 SHA256/SHA512 测试无问题。系统相册选图已反馈可用；现在验收展示名称编辑，平台模拟验证不等于完整真机通过。

1. 本轮视觉与导航改版 Android 验收（含原备份流程回归）；此前 receiveTasks 每秒报错需观察，尚未确认修复
2. 展示名称编辑代码及本地验证完成，Android 待验；手动添加暂不做，APK 后续由用户使用 HBuilderX 打包
3. 深色模式（本轮未实现，不展示假开关）
4. 本地密钥保护 + 应用锁

**待定位**
- `created` vs `mounted` 真机差异的真实机制。

## 7. 新会话启动指引

1. 读：`AGENTS.md` → `.ai/project.md` → `.ai/architecture.md` → `.ai/conventions.md` → `.ai/security.md`。
2. 读加密备份相关：`.ai/plans/2026-10-26-encrypted-backup.md`（设计+进度）→ `.ai/decisions/2026-10-26-encrypted-backup.md`（技术取舍）→ `.ai/plans/2026-10-26-saf-write-0kb-issue.md`（SAF 故障过程与结论）。
3. 在内层应用目录运行 `npm test` 确认当前 126 项基线通过（约 79 秒）。
4. 用 HBuilderX 打开 `my-auth/`，USB 真机运行确认基线可用。
5. 与用户对齐本次要做什么，再动代码。

## 8. 本会话脉络（简）

基线 `0b27c16`（27 项测试）→ 加密备份设计拍板 → 批次 A（backup-merge 纯逻辑+16 单测）→ 批次 B（backup-crypto 加密核心+19 单测，含 Node crypto 对照）→ V1 真机：crypto-js App 端无 window.crypto，重构为依赖注入+platform-random（Android SecureRandom）→ V2 真机：SAF 写文件反复 0kb，求助 GPT 后定位（startActivityForResult 三参数不触发回调→两参数+onActivityResult 覆盖；read(byte[]) 静默失败→逐字节 read()）→ 验证页跑通导出 667 字节 verified + 恢复解密 + 合并写回 + home onShow 重载 → 加按钮 4"恢复并写回存储"→ 修读取失败防御 → 阶段存档。

## 9. 环境

- Node：系统 `v22.11.0`（npm `10.9.2`）；Git `2.55.0`。
- HBuilderX 5.26 + "App真机运行"插件。
- Android 真机：USB 调试，扫码用公开密钥 `JBSWY3DPEHPK3PXP` 的二维码。
- 无微信开发者工具、Java、全局 ADB 或 Android SDK 环境变量（暂不需要）。
