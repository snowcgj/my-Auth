# 第一批 Android 稳定性重构计划

- 日期：2026-10-26
- 状态：批次 A/B/C 与核心体验批次已完成并通过 Android 真机核心流程回归；批次 D 真机回归部分完成（参数乱序/8位/60秒/拒绝用例的真机用例仍缺，见下）；旧 `finial.js` 与实验文件待清理
- 验收平台：Android 真机
- 范围性质：正确性与可靠性打底，不改视觉风格，不做云同步

## 背景

当前项目已经通过 Android 真机基础验收：首页显示、周期刷新、扫码添加、删除、重启持久化和后台恢复均可正常工作。静态审查同时确认了以下边界问题：

1. `otpauth://` 解析依赖字符串顺序，参数乱序、URL 编码和附加参数会产生错误结果。
2. 密钥和完整账户对象会进入调试日志。
3. 每张账户卡片各自持有定时器，并且只在恰好观察到剩余 30 秒时刷新，存在跳过时间窗口的可能。
4. 主算法没有可重复执行的自动测试入口，仓库内还保留多套容易误用的实验实现。

## 目标

1. 让二维码解析按标准参数语义工作，并对不支持的组合明确报错。
2. 清除敏感日志，不再输出密钥、完整账户或二维码原文。
3. 将刷新依据从“某一秒是否恰好被观察到”改为“时间窗口是否变化”。
4. 为 TOTP 和二维码解析建立自动测试，防止后续重构回归。
5. 保持现有 Android 可用体验，不在本批引入界面重构。

## 明确不做

- 不更换 uni-app、Vue 3 或 HBuilderX。
- 不替换当前已通过标准向量的手写 HMAC-SHA1 实现。
- 不做 SHA256、SHA512 或 HOTP 生成能力。
- 不做密钥加密、应用锁、备份、云同步或权限精简。
- 不做视觉改版、图标改版或新增页面。
- 不清理无关实验文件；只避免它们继续参与主链路。

## 建议的模块边界

本批采用小步抽离，不一次性移动整个项目：

- `my-auth/utils/totp-core.js`：纯 TOTP 计算，时间和配置通过参数传入。
- `my-auth/utils/otpauth.js`：纯二维码解析与校验，不调用 `uni.*`。
- `my-auth/utils/finial.js`：暂时保留为兼容入口，等新实现通过测试后再收敛。
- `my-auth/tests/`：自动测试，使用公开测试向量和测试 URI。

二维码解析结果统一为：

```text
type, issuer, accountName, secret, algorithm, digits, period
```

第一批只接受 `type=totp` 和 `algorithm=SHA1`；可以支持 `digits=6/8` 与常见 `period`；不支持 HOTP、SHA256、SHA512 或其他参数时明确拒绝，不能静默按默认值生成。

## 分批实施

### 批次 A：纯逻辑与自动测试

状态：已完成（2026-10-26）。

1. 已抽出纯 TOTP 计算接口 `my-auth/utils/totp-core.js`，时间以 `timestampSeconds`（Unix 秒）传入，模块内部不读取系统时间。
2. 已建立纯二维码解析模块 `my-auth/utils/otpauth.js`，不依赖 `uni.*`、浏览器全局 URL API、存储或日志。
3. 已建立 `my-auth/tests/`，使用 Node 内置 `node:test`、`assert` 和 `crypto`；Node API 只用于测试对照，不进入运行时代码。
4. 已在 `my-auth/package.json` 增加 `npm test`，命令为 `node --experimental-default-type=module --test tests/totp-core.test.mjs tests/otpauth.test.mjs`。
5. 实际测试结果为 19 个测试全部通过，包括 RFC 6238 六组 8 位标准向量、Node 独立 crypto 对照矩阵、周期边界、前导零、Base32 规则和 otpauth 异常输入。

本批确定的支持范围：`algorithm=SHA1`、`digits=6/8`、`period=30/60`。Base32 接受大小写、ASCII 空白和规范尾随填充；空密钥、非法字符、非规范长度、非规范填充和非零残留位都会报错。`finial.js` 与页面调用路径暂时不变，因此本批存在有意的重复算法代码；批次 B 接入新解析模块并完成 Android 回归后，再收敛旧入口和重复实现。

### 批次 B：接入解析与日志收敛

状态：已通过 Android 真机回归（2026-10-26）。

1. `home.vue` 已改为调用 `parseOtpAuthUri`，不再使用字符串拆分。
2. 新增账户保存 `issuer、accountName、secret、algorithm、digits、period`；`app/name` 暂时保留为显示字段。
3. 读取本地存储时通过 `normalizeAccount` 补齐旧账户默认 `SHA1 + 6 位 + 30 秒`。
4. 删除扫描结果、明文密钥、完整账户对象和二维码原文等敏感日志；保留非敏感错误提示。
5. `AccountItem.vue` 已切换到 `totp-core.generateTOTP`，并接收 `digits/period`；定时器仍按卡片维护，批次 C 再收敛。
6. `npm test` 19 项仍全部通过；Android 真机行为未由本次测试覆盖。

### 批次 C：计时刷新收敛

状态：已通过 Android 真机回归（2026-10-26）。

1. `home.vue` 维护单一 `now` 时钟和 `timer`，通过 `startClock/stopClock` 管理。
2. `AccountItem.vue` 不再持有 `setInterval`、`timer` 或 `beforeDestroy`。
3. 卡片接收 `timestampSeconds`，在 `mounted` 和 `watch` 中调用 `refresh`，按时间窗口变化生成验证码。（由 `created` 改为 `mounted`：App 上 `created` 阶段 props 可能尚未就位，导致 `generateCode` 拿不到 `secret` 抛错、`code` 停在空串、点击复制静默返回。详见批次 D 真机修复记录。）
4. `home.vue` 新增 `onShow` 刷新 `now`，回到前台时主动刷新。
5. `home.vue` 使用 Vue 3 `beforeUnmount` 清理定时器。
6. `npm test` 19 项仍全部通过；Android 真机刷新行为未由本次测试覆盖。

### 批次 D：Android 真机回归

状态：已完成（2026-10-26，HBuilderX 5.26）。

通过项：

- 验证码生成与倒计时、每秒刷新、进入新周期更新。
- 扫码添加（公开密钥 `JBSWY3DPEHPK3PXP`）。
- 删除账户（带二次确认）、置顶与置顶排序。
- 搜索过滤（输入不匹配词清空、匹配词保留）。
- 点击复制并 toast 提示。
- 完全退出重开后账户持久化、后台恢复后刷新。

核心体验批次（计划外补充，已并入本批回归）：

- `home.vue`：搜索框、`displayAccounts` 过滤+置顶排序、删除二次确认、`normalizeAccount` 补 `pinned/sortOrder`、`onTogglePin`。
- `AccountItem.vue`：点击复制、验证码分组显示（6 位 `123 456`、8 位 `1234 5678`）、置顶标记、菜单置顶选项。

真机修复（回归中发现并修复）：

1. 搜索过滤无反应：uni-app App 原生 `<input>` 的 `v-model` 在「输入 → 计算属性过滤 → `v-for` 重渲染」链路上反应性时序不可靠。`home.vue` 改为 `:value` + `@input="onSearchInput"`，handler 内 `this.keyword = event.detail.value`。
2. 点击复制无反应：现象是 `created()` 中 `generateCode` 后 `this.code` 为空、`onCopyCode` 静默返回；将 `refresh()` 移到 `mounted()` 后真机恢复弹「已复制」。**具体原因待定位**——标准 Vue 中 props 在 `created` 之前已解析，故不能简单归因于 props 时序；可能与 uni-app App 原生渲染时机或异常传播有关，本轮未深入定位。`AccountItem.vue` 同时为 `generateCode` 包 `try/catch`、空 code 时弹「验证码尚未生成」toast 便于区分。

未覆盖：

- 参数乱序、URL 编码账户名的二维码未单独构造测试用例在真机验证（仅用公开标准二维码）。解析逻辑由 `otpauth.test.mjs` 10 项单测覆盖。
- 不支持组合（HOTP/SHA256/SHA512）在真机的明确拒绝行为未单独验证，由单测覆盖。
- 微信小程序与 H5 未验证。

### 修订批（评审驱动，2026-10-26）

外部评审后修复三项 P1 与两项 P2，`npm test` 升至 27 项通过（新增 `account.test.mjs` 8 项）：

1. **加载即回写覆盖（P1）**：移除 `home.vue` 的 accounts 深度 watcher，新增 `loadAccounts()`；读取成功才替换 `accounts`，失败置空不覆盖原存储、不保留演示账户。`normalizeAccount` 抽到纯模块 `utils/account.js`，改为保留未知字段（`...account`）且仅对缺失项补默认（`??`），非法值（`digits=0`、`algorithm=SHA256`）保留原样由 totp-core 抛错。
2. **保存失败仍提示成功（P1）**：`saveAccounts()` 改为 `persistAccounts(next)` 返回布尔；增/删/置顶均"先持久化成功再更新内存与提示，失败保留原状态并报错"，消除内存与磁盘不一致及重复写入。
3. **algorithm 未透传（P1）**：`home.vue` 传 `:algorithm`，`AccountItem` 加 `algorithm` prop 并传入 `generateTOTP`；不支持配置时卡片显示"配置不支持"而非生成错误码，`onCopyCode` 在不可用时给出提示。
4. **刷新缓存不完整（P2）**：`refresh` 改为生成成功后才更新 `lastWindow`（失败可同窗口重试）；新增 `invalidateCode()`，`secret/digits/algorithm/period` 变更时强制重算。
5. **文档根因措辞与测试数（P2）**：本文件将"created 阶段 props 未就位"改为"现象+原因待定位"；otpauth 单测数 9→10；合计测试 19→27。

移除 `data()` 中硬编码的演示账户（含公开测试密钥，违反 `security.md`"不把演示账户混入真实用户数据"）。`loadAccounts` 的 `getStorage` fail 无法区分"无数据"与"真实错误"，故 fail 按空列表处理，不再尝试三态。

待真机回归：搜索、复制、删除确认、置顶、加载迁移（旧账户保留未知字段、非法旧配置显示"配置不支持"）、保存失败提示。

## 验收标准

- 现有测试二维码继续正常添加和生成验证码。
- RFC 6238 标准向量测试全部通过。
- 参数乱序时仍能读取正确的 `secret` 和 `issuer`。
- URL 编码账户名能正确显示，不再被 `%` 截断。
- `digits=8` 和 `period=60` 的 TOTP 测试用例按配置生成；HOTP 和 SHA256/SHA512 明确拒绝。
- 源码中不再输出明文密钥、完整账户或二维码原文。
- 后台恢复、重启持久化、周期刷新和删除流程在 Android 真机上通过。
- 业务页面外观不因本批发生刻意变化。

## 风险与处理

- 新增测试依赖可能影响 HBuilderX 项目结构：只加开发依赖，不改变运行时代码；安装后在 Android 上回归。
- URL 解析 API 在不同运行容器中存在差异：测试用例和 Android 真机共同验证，必要时使用轻量的手工查询参数解析。
- 旧账户没有新字段：读取时按默认值迁移，不能导致已有账户消失。
- 新计时逻辑可能改变刷新时机：先保留现有展示形式，只改变触发依据。

## 回退方式

实施前确保当前 Git 工作树状态清晰，并保留本次计划文件。每个批次完成后单独检查 diff；若某一批 Android 回归失败，只回退该批涉及文件，不同时撤销已验证的其他批次。
