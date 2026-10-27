# my-Auth（README 草稿）

> 草稿说明（供内部审核，发布前删除本段）：本稿为重写版，替代原"早期日志"式 README。截图占位待补；测试数据为 2026-10-27 实测；许可证待定。

**my-Auth** 是一个本地二次验证（TOTP）验证器：离线生成动态验证码，数据只保存在设备本地，不上传服务器。基于 uni-app（Vue 3）开发，使用 HBuilderX 运行与打包，当前以 Android 真机为主要验收平台。

项目地址：<https://github.com/snowcgj/my-Auth>

## 功能

- **动态验证码**：TOTP（RFC 6238），支持 SHA-1 / SHA-256 / SHA-512 算法，6 或 8 位，30 / 60 秒周期；账户卡片实时倒计时刷新。
- **添加账户**：扫描网站提供的 `otpauth://` 二维码添加；支持 SHA-256/SHA-512 参数的二维码解析。
- **账户管理**：搜索过滤、置顶（独立分组）、重命名、删除（二次确认）、点击卡片复制验证码。
- **加密备份与恢复**：创建密码加密的备份文件（系统文件选择器导出到任意位置）；恢复时选文件 → 输入密码 → 预览差异 → 确认合并；与现有账户重复的条目自动跳过。
- **备份状态提示**：首页提示"有未备份变更"，设置页展示备份摘要。
- **本地化设计**：无需注册、不联网生成；设置页内置使用说明与数据隐私说明。

## 界面截图

【待补：新版三页界面截图（首页 / 备份 / 设置），建议存至 `githubpic/` 或 `docs/screenshots/`】

（当前仓库中 `githubpic/1.jpg` 为早期版本界面，仅供历史参考。）

## 运行（HBuilderX）

1. 使用 HBuilderX 打开仓库中的 `my-auth/` 子目录（uni-app 项目根，含 `manifest.json`）。
2. 运行 → 运行到手机或模拟器 → 运行到 Android App 基座（标准基座即可，扫码等功能开发期可用标准基座全模块调试）。
3. 建议在 Android 真机上验收（文件备份使用系统文件选择器，模拟器行为可能不同）。

## 测试

核心逻辑（TOTP 算法、`otpauth://` 解析、账户规范化、备份加密/合并、SAF 文件读写协议、备份摘要）有独立的 Node 测试，不依赖真机：

```bash
cd my-auth
npm install
npm test
```

- 测试运行器为 Node 内置 `node --test`（脚本使用 `--experimental-default-type=module` 参数，需要较新的 Node.js 版本；建议 Node 20+，更旧版本可能无法识别该参数，未做旧版兼容性验证）。
- 共 7 个测试文件、122 项测试（2026-10-27 实测全部通过；因包含大量 PBKDF2 迭代，单次运行约 1–2 分钟）。

## 平台支持

| 平台 | 状态 |
|---|---|
| Android（真机） | 主要验收平台；文件备份基于 SAF（Android 4.4+ 的系统文件框架，应用无需存储权限） |
| 微信小程序 / H5 | 代码保留跨端兼容，当前阶段不做验收，仅避免明显破坏 |
| iOS | 未验收 |

- `manifest.json` 未配置 `minSdkVersion`（使用 HBuilderX 默认值）；已在 Android 真机验证的最低系统版本以实际验收记录为准。
- 正式打包必须声明扫码模块（见下文"打包说明"）；开发期标准基座自带全部模块。

## 数据保存、加密备份与恢复

**本地数据**

- 账户保存在应用本地存储（`uni.setStorageSync('accounts')`）；验证码完全离线生成，不联网。
- **安全边界（重要）**：备份文件使用密码加密；但应用内的本地账户存储**当前尚未做应用层加密**，也没有应用锁。请勿在不可信设备上长期使用，或期待本地数据能抵御设备持有者的读取。

**加密备份（导出）**

- 在"备份与恢复"页设置密码后创建备份，通过系统文件选择器（Android SAF）保存到用户选择的位置。
- 文件格式（v1）：随机 16 字节盐 + PBKDF2-HMAC-SHA256（100,000 次迭代）派生密钥，AES-256-CBC 加密，HMAC-SHA256 做 Encrypt-then-MAC 完整性校验。
- **备份密码无法找回**：密码不参与任何找回机制，遗忘密码将无法解密该备份文件。

**恢复与合并**

- 恢复流程：选择备份文件 → 输入密码解密 → 预览将导入的账户 → 确认合并。
- 合并策略：与现有账户 secret 相同（不区分大小写）的条目跳过，不做覆盖更新；其余条目追加导入。
- 应用记录最近一次备份状态（`backup_meta`），据此在首页提示"有未备份变更"。
- 导入文件大小上限 1MB，导出单次上限 64KB（正常账户数据远小于该限制）。

## 项目结构

```
├── .ai/                  # AI 协作文档（项目说明、架构、约定、安全约束、计划与决策记录）
├── githubpic/            # README 截图
└── my-auth/              # uni-app 项目根（HBuilderX 打开此目录）
    ├── pages/
    │   ├── home/         # 首页：账户列表、搜索、扫码添加
    │   ├── backup/       # 备份与恢复
    │   └── settings/     # 设置：使用说明、隐私说明、备份摘要
    ├── components/       # AccountItem、AppHeader、AppDialog、AppToast、ActionSheet、
    │                     # BusyOverlay、AccountNameEditor、ServiceIcon、AppIcon 等
    ├── utils/
    │   ├── totp-core.js      # TOTP 核心（Base32 解码、动态截断、SHA1/SHA256/SHA512）
    │   ├── otpauth.js        # otpauth:// 二维码 URI 解析
    │   ├── account.js        # 账户数据规范化
    │   ├── backup-crypto.js  # 备份加密/解密（crypto-js）
    │   ├── backup-merge.js   # 恢复合并策略
    │   ├── platform-file.js  # Android SAF 文件读写（Native.js）
    │   ├── platform-random.js# 安全随机数
    │   └── backup-summary.js # 备份状态摘要
    ├── styles/theme.css  # 全局视觉变量（CSS 自定义属性）
    ├── tests/            # Node 测试（npm test）
    └── static/           # 图标与品牌图
```

> 说明：`utils/` 与 `pages/`、`components/` 下存在少量早期实验文件（如 `utils/core.js`、`utils/finial.js`、`pages/index/`、`components/AccountItem copy.vue` 等），未在运行链路中引用，属待清理遗留。

## 已知限制

- 不支持 HOTP 计数器模式，不支持自定义位数与周期（仅 6/8 位、30/60 秒）。
- 恢复合并只"跳过重复"，不更新已有账户内容。
- 本地账户存储未做应用层加密、无应用锁（见上文安全边界）。
- 扫码依赖设备相机；"从相册选图识别二维码"尚未实现（已在调查规划中）。
- 微信小程序 / H5 未验收。
- 仓库无 LICENSE 文件，许可证待定（见下）。

## 打包说明

1. HBuilderX → 发行 → 原生 App-云打包（Android）。
2. `manifest.json → app-plus.modules` 需声明 `"Barcode"` 模块（扫码功能依赖；开发期标准基座自带，正式包不声明会导致扫码不可用）。
3. 无需申请存储权限：备份读写通过 Android SAF（`ACTION_CREATE_DOCUMENT` / `ACTION_OPEN_DOCUMENT`）由用户在系统界面选择文件。
4. 应用图标位于 `my-auth/unpackage/res/icons/`。

## 许可证

许可证待定。仓库当前未包含 LICENSE 文件，**暂不构成任何开源许可声明**；使用、复制与分发请先与作者确认。
