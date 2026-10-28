# Android 独立安装包发布

- 基线：5e94f51。
- 用户授权打包、发布，后确认可以手动操作 HBuilderX；独立安装新版，保留旧版。
- 新包名：io.github.snowcgj.myauth；显示名 Auth；版本 1.0.0 / 100。DCloud appid 保持现有值，不擅自创建或更换账号应用。
- 主 agent 准备配置、可追踪的 Android 图标与发布说明；用户在 HBuilderX 选择证书及提交云打包，不在聊天/仓库中填写签名密码。
- 清理显式声明的非必要权限，保留扫码相关项；DCloud 可能自动合并基础/模块权限，最终权限须检查实际 APK，不能仅凭配置宣称 APK 无某权限。
- 本机已有 2024 年两份 APK，保留原文件，不能冒充本次产物。新 APK 不提交 Git，后续通过 GitHub Release 附件发布。
- 先检查生产 App 资源编译，随后真机验证签名 APK（安装、扫码、选图、复制、名称编辑、背景、重启、备份/恢复）；本地资源编译成功不是 APK 或发布成功。
- 当前 GitHub 连接器没有 Release 创建/附件上传能力，本机未发现 gh 或 GH_TOKEN/GITHUB_TOKEN；如仍无可用发布通道，准备发布说明供用户网页上传，不提取其他软件的登录凭据。
- 状态：准备中，等待用户手动签名与云打包；未创建标签或发布 Release。

## 本轮准备结果

- manifest 已配置 Auth / io.github.snowcgj.myauth / 1.0.0(100)，保留 DCloud appid 与 Barcode。移除旧显式设备标识、账号、日志、系统设置等权限；保留 CAMERA/VIBRATE/FLASHLIGHT，camera/autofocus feature 为 optional。自动合并权限留待 APK 检查。
- Android 图标转为 static/app-icons 下可追踪矢量及 PNG，已验证尺寸/路径并目视检查；iOS 配置未改。
- JSON5 manifest 解析与 git diff --check 通过。尝试 cli publish app --type appResource 后输出“此功能需要先登录”，未开始生产编译或产生新 APK，不能当作编译通过。
- docs/android-release.md 与 docs/releases/v1.0.0.md 已准备。用户将在 HBuilderX 本地登录/选证书/打包；未要求在聊天提供密码。未提交、创建标签或发布 Release。

## 首轮云打包失败与修复（2026-10-27）

首轮 20:36 提交，20:59 报失败；错误为 includePermissions/AndroidManifest.xml 中 camera/autofocus uses-feature 重复，发生在 :includePermissions:processReleaseManifest。源码手工添加的 required=false feature 与打包链生成的同名声明冲突。移除两项手工 uses-feature，保留 Barcode 与 CAMERA/VIBRATE/FLASHLIGHT。manifest JSON5 与源码检查通过；21:05 HBuilderX 5.26 生产 App 资源编译/导出成功（unpackage/resources），导出后的运行时 manifest 不含 distribute 配置，不能据此声称云端 Android 清单合并已通过。

21:06 使用 CLI 沿用 io.github.snowcgj.myauth、云端证书(type 3)、快速安心打包，未启用广告。重新编译通过，21:06:19 提交云端成功；检查本次 cache/wgt manifest 确认不再含手工 uses-feature。当前等待云端结果，不重复提交。

## 后续结果与品牌更新

上述云任务已成功，APK 21:48 下载完成，大小 15164600 字节，SHA256 C884D20167E00CC9387E195269AFB1DFC25B4A4F7FCF143228FCFAD935D96FF4。aapt2 核对为 Auth 1.0.0(100)、io.github.snowcgj.myauth，签名核验通过。用户安装后发现白图标，已从 APK 提取图标确认源小图本身仅含背景，原因是旧导出脚本未缩放；不是据此推定系统缓存问题。

用户授权全新名称/图标/启动画面，选定芝码，当前候选为 1.0.1(101)。新资源已本地检查和生产资源编译，详见芝码品牌计划；README 重整、GitHub Release 与最终安装验收仍待完成。上文早期“等待”及 static/app-icons 的记录仅代表当时状态。
