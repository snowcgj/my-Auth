# Android 打包与发布

当前发行版是 **芝码 1.0.1（101）**，包名 `io.github.snowcgj.myauth`，DCloud AppID 保持 `__UNI__1835605`。维护者已反馈安装与迁移使用正常；2026-10-28 已在 [GitHub Release](https://github.com/snowcgj/my-Auth/releases/tag/v1.0.1) 发布 APK 和独立校验文件。发布说明见 [v1.0.1](releases/v1.0.1.md)。

## 打包前先确认身份与数据

- 2024 年旧版包名为 `uni.UNI1835605`，与新版独立安装。旧版账户不会自动搬入，不要通过卸载旧版来排查安装问题。
- 本次 Auth 1.0.0 与芝码 1.0.1 使用同一新版包名和签名，可以覆盖升级。保留签名证书，后续同包名升级也必须使用相同签名。
- 签名证书、密码、离线 AppKey 本地配置、真实账户、二维码和备份文件均不提交 Git。正式证书应长期单独备份，不把可删除的构建工具目录当作唯一存放位置。

## HBuilderX 云打包

1. 登录 HBuilderX，打开内层 `my-auth/`，确认账号拥有当前 AppID。
2. 保存文件，在 `manifest.json` 核对显示名“芝码”、版本 1.0.1（101）、Android 包名和 Barcode 模块。以后发布须递增版本号。
3. 通过“发行 → 原生 App-云打包”进入打包界面（菜单以 HBuilderX 实际版本为准），只选 Android、APK、正式应用包，不选自定义调试基座。
4. 沿用当前应用的云端证书，或使用已验证与其一致的本地证书。不要改用公共测试证书或临时 debug 签名。
5. 不添加广告、统计、推送等无关模块。相册与备份使用用户授权的系统选择器，不为它们添加全盘存储权限。DCloud 会合并 Runtime/模块声明，最终权限需要检查实际 APK。
6. 提交后等待完成，避免重复提交同一任务。安心打包会在云端生成原生包，再由本地合并资源并签名，自动完成期间保持 HBuilderX 运行、联网且电脑不睡眠。
7. 结果通常保存到 `my-auth/unpackage/release/apk/`。按实际应用名和版本确认产物，不要误用仓库附近的 2024 年旧 APK。

高峰期云打包可能长时间排队。本次芝码任务从 2026-10-27 22:47 提交到 23:53 完成，约66分钟；这只是一次实际记录，不是固定耗时承诺。优先固定包名、模块与签名，符合条件时安心打包可复用原生包，但名称、权限或工具版本等变化可能重新触发云端构建。以[DCloud 安心打包说明](https://uniapp.dcloud.io/tutorial/build/SafePack.html)为准。

## 本地离线打包

本地打包仍需要 DCloud 的原生运行环境，不能只靠 Node 或 Android SDK 构建当前 uni-app：

1. 准备 JDK、Gradle、Android SDK / Build Tools，版本以所选 DCloud SDK 的原生示例和官方要求为准。
2. 下载与 HBuilderX 匹配的**普通 uni-app** Android 离线 SDK，不混用 uni-app x、Alpha 或其他版本。下载后核对 Readme 和 release 说明，不仅看文件名或“最新版”目录。
3. 按 SDK 原生示例接入基础库、Barcode 模块及 HBuilderX 导出的生产资源，并配置图标和启动图。
4. 从开发者中心申请匹配 **AppID + 包名 + 签名 SHA1** 的离线 AppKey，接入已验证的正式签名，再实际构建和验收 APK。

官方 SDK 下载可能经百度网盘或和彩云分发；分享限制、登录或渠道可用性会影响搭建。本次已准备并验证独立 Android 工具链、页面资源和签名，但 SDK 与 AppKey 尚未完整接入，**芝码完整离线打包仍未完成**。发布不依赖这项后续工作。

参考：[官方 Android SDK 下载](https://nativesupport.dcloud.net.cn/AppDocs/download/android.html)、[原生工程配置](https://nativesupport.dcloud.net.cn/AppDocs/usesdk/android)、[申请离线 AppKey](https://nativesupport.dcloud.net.cn/AppDocs/usesdk/appkey)。

## 图标与启动图

Android 配置引用 `my-auth/static/branding/zhima/`：四密度桌面图标为72/96/144/192px，启动图为三密度真实 NinePatch。SVG 母版和生成说明在[品牌资源目录](../my-auth/static/branding/zhima/README.md)。

生成器仅在开发时使用 Chrome 栅格化，无应用运行时依赖。导出时显式缩放并检查每张图片，避免旧脚本只截到背景。最终 APK 也必须提取图标核对，不能仅检查1024px母图；冷启动效果需安装包真机确认。iOS 旧配置保留且未验收。

## 产物验收

- 使用 aapt2 核对显示名称、包名、版本、图标与合并后的权限，用 apksigner 验证签名并与上一版比较。
- 使用公开演示账户检查相机、系统选图、验证码、复制、搜索、置顶、名称编辑、主题、重启与后台恢复。
- 检查加密导出、错误密码、取消、解密预览和恢复合并；失败时原有账户不应改变。
- 安装旧包名/新包名时明确区分应用；同包名升级优先覆盖安装，先备份，不通过卸载绕过签名不一致问题。
- 计算最终附件 SHA256，并核对发行说明中的文件名、字节数、版本和校验值。

当前1.0.1已完成包信息/签名/四密度图标检查，并收到维护者安装、迁移与使用正常反馈。没有宣称所有 Android 设备均已验证。模拟桥接测试与浏览器预览不能替代原生验收。

## GitHub Release

本版已按用户授权完成提交、推送、v1.0.1标签及Release，标签指向788aaf8。以下为后续发布可参照的流程，本版附件已上传：

1. 审查并提交品牌配置、文档、LICENSE 与演示截图，确认无凭据、真实账户或构建产物进入 Git。标签须对应包含本次 APK 运行代码及资源的提交，不能指向旧版基线。
2. 创建 `v1.0.1` 标签和 Release，将 [v1.0.1 说明](releases/v1.0.1.md)作为正文，移除其中的“发布准备”提示。
3. 上传 `Zhima-1.0.1-20261027.apk` 和 [SHA256SUMS-v1.0.1.txt](releases/SHA256SUMS-v1.0.1.txt)；APK 只作为附件分发，不加入源码 Git。
4. 检查下载链接和校验文件，再将 README 中“附件待上传”的状态更新为已发布。

可使用 GitHub 网页“Releases → Draft a new release”。如果由自动化上传，必须先确认当前有可用且获授权的 Release API 或 CLI；git SSH 推送权限不等于 Release API 授权，不从其他软件缓存提取登录凭据。
