# 架构说明

## 当前结构

仓库根目录保存文档和依赖配置，uni-app 应用位于 `my-auth/`。

主要运行链路：

- `my-auth/pages/home/home.vue`：账户列表、扫码、二维码解析、增删、本地存储，并维护单一秒级时钟 `now`，通过 `timestampSeconds` 下发给卡片。
- `my-auth/components/AccountItem.vue`：单账户展示与验证码计算，接收父级 `timestampSeconds` 按时间窗口刷新，不持有自身定时器。
- `my-auth/components/AppHeader.vue`、`AppIcon.vue`、`ServiceIcon.vue`、`ActionSheet.vue`：共用导航头、本地图标、服务图标与操作面板；`styles/theme.css` 定义视觉变量和共用样式。
- `my-auth/components/AppDialog.vue`、`AppToast.vue`、`BusyOverlay.vue`：统一确认/说明、轻提示、备份等待反馈；卡片通过 notify 事件交由首页展示提示。`utils/feedback-render.js` 为同步计算前的绘制让渡，不是后台计算。
- `my-auth/utils/backup-summary.js`：仅用于首页/设置的只读备份摘要，复用既有指纹函数；不更改账户或备份元信息。
- `my-auth/pages.json`：三个页面均保留注册，移除 Tab；首页通过 `navigateTo` 进入设置或备份，再用 `navigateBack` 返回。首页 onShow 重读账户并启动单一时钟，onHide/onUnload/beforeUnmount 清理时钟。改版的 Android 验收待执行，取舍见 `.ai/decisions/2026-10-27-ui-navigation.md`。
- `my-auth/utils/totp-core.js`：当前运行时使用的 TOTP 计算；保留手写 Base32/SHA1/HMAC-SHA1，SHA256/SHA512 HMAC 复用已有 CryptoJS。密钥和计数器通过二进制 WordArray 转换，时间和配置通过参数传入；默认 SHA1，运行时不使用 Node API 或随机数。
- `my-auth/utils/otpauth.js`：当前运行时使用的 `otpauth://` 解析与校验。
- `my-auth/utils/account.js`：账户规范化，补齐缺失字段、保留未知字段、不静默修正非法值；纯逻辑，被 `home.vue` 加载存储时调用。
- `my-auth/utils/finial.js`：旧实现，已被上述模块取代，暂未删除，待清理引用后移除。

**加密备份相关模块**（2026-10-26 ~ 10-27 新增，最小验证链路已跑通）：

- `my-auth/utils/backup-merge.js`：纯逻辑，`serializeForBackup`（剔除 code/countdown）、`buildDuplicateKey`（secret 小写 + algorithm/digits/period，缺省 SHA1/6/30）、`buildAccountFingerprint`（djb2 变体指纹）、`mergeAccounts`（skip 策略，保留现有 pinned/sortOrder）。默认配置保留历史去重键/指纹；非默认配置旧指纹可能显示有更新，账户不变。不依赖 `uni.*`/Node `Buffer`/`crypto`。
- `my-auth/utils/backup-crypto.js`：纯逻辑加密核心，`createBackup`/`openBackup` + `BackupError`。AES-256-CBC + PBKDF2-HMAC-SHA256(100000) + HMAC-SHA256(EtM)。**依赖注入** `options.randomBytes`，核心不碰平台 API。参数校验：password 非空字符串、iterations 精确接受 V1 唯一值 100000（异常参数在 PBKDF2 前拒绝）、salt/iv 字节数校验。
- `my-auth/utils/platform-random.js`：平台适配层，`getRandomBytes(n)`。Android 走 `java.security.SecureRandom` via Native.js，其他走 Web Crypto，不可用返回 null。
- `my-auth/utils/platform-file.js`：平台适配层，`pickFileForSave`/`pickFileForRead`/`writeSafJsonVerified`。Android 走 SAF。逐字节 `write(int)`/`read()` 保留本机已验证算法；系统结果交由 activity-result 统一监听和互斥，不再自行覆盖回调。导出 64KiB / 导入 1MiB 上限，页面调用面仍为 callback；回调重构后真机待回归。
- `my-auth/utils/activity-result.js`：共享系统选择器入口，只安装一次 onActivityResult，单一 pending 请求互斥，2001/2002 为备份、3001 为选图；启动抛错/返回结果时释放，未知结果转交安装前已有的可调用处理器。用户长时间停留选择器不以超时报失败。
- `my-auth/utils/platform-image.js`：Android Photo Picker（33+）或 ACTION_OPEN_DOCUMENT(image/*)，ContentResolver → Java Channels/64KiB ByteBuffer → 本次私有缓存文件 → plus.barcode.scan(QR) → 尝试删除缓存。20MiB 上限，输入输出计数严格检查、部分写入处理、关闭流；仅 Android 显示入口。桥接和解码引擎真机待验，不把 Promise 包装称作后台 IO。
- `my-auth/pages/backup/backup.vue`：正式备份与恢复流程（批次 C 真机验收通过）。创建备份读真实 accounts + 密码二次确认 + SAF 导出读回一致才写 backup_meta；恢复选文件→输密码→解密预览→确认才合并→写入前重新读取现有账户；备份状态展示（onShow 刷新 backup_meta + 当前指纹比对）；三处密码输入用 uni-app 官方 password 属性。

调用关系：`backup.vue` → `createBackup(password, accounts, {randomBytes: getRandomBytes})`（注入 platform-random）→ `pickFileForSave(filename, json, callback)`（platform-file 写）；恢复 `pickFileForRead(callback)` → `openBackup(password, content)` → `mergeAccounts(existing, incoming)` → `uni.setStorageSync('accounts', merged)`。

备份页面为等待反馈将调用编排改成 async/await，原生回调以 Promise 包装，密码学与文件 IO 内部未改。busy 在开始让渡前设定、finally 清理；页面卸载使令牌失效，尚未开始的计算/页面写入不再继续；已发起的原生操作不声称被撤销。详情及未验边界见 `.ai/plans/2026-10-27-feedback-ui.md`。

- `my-auth/tests/`：基于 Node `node:test` 的自动测试，`npm test` 运行（**112 项**：totp-core 27 + otpauth 11 + account 8 + backup-merge 19 + backup-crypto 31 + platform-io 16）。含 18 条 RFC 向量、Node crypto 对照、加密往返、模拟 Java 通道与结果路由，不进入运行时。SHA2 用户真机反馈通过；选图和共享回调重构仍待真机。

当前还保留多套实验算法、页面副本和调试代码。引用前必须确认是否属于主运行链路，不能仅凭文件名判断。

## 目标架构

以下是渐进调整方向，不表示这些目录和模块已经创建：

| 层级 | 职责 |
| --- | --- |
| 页面与组件 | 展示和用户交互，不直接实现密码学或存储细节 |
| 统一账户状态 | 账户列表、加载状态、增删改查、当前时间窗口 |
| 核心领域逻辑 | TOTP、Base32、`otpauth` 解析和输入校验，不依赖 `uni.*` |
| 平台适配 | 存储、扫码、剪贴板、时钟和系统安全能力 |

## 关键约束

- 账户数据只有一个状态来源，页面之间不通过 `getCurrentPages()` 调用彼此方法。
- 全局维护一个秒级时钟，按时间窗口变化统一刷新；不让每张卡片各持有一个业务定时器。
- 核心算法通过参数接收时间和配置，便于使用固定向量测试。
- 账户元数据与密钥保护分别设计，持久化结构需要版本号和迁移策略。
- 平台 API 通过适配边界调用；不支持的平台必须明确降级，不能静默失败。
- 保留跨端能力，不以仅适用于 Node.js 的 `Buffer`、`crypto` 等接口替换通用实现。

## 技术取舍

暂不更换 uni-app，也不要求一次性迁移全部代码。新代码或正在重构的模块优先使用 Vue 3 Composition API 和渐进式 TypeScript；状态共享确有需要时采用单一账户 store，避免过度分层。
