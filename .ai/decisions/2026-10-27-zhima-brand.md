# 芝码品牌接入

用户选定“芝码”，取“芝麻开门”之意。显示名与品牌资源更新为芝码，仓库仍是 my-Auth；Android 包名 io.github.snowcgj.myauth、DCloud appid 和云端证书保持不变，以 1.0.1(101) 覆盖本次 Auth 1.0.0，不触碰账户存储或备份协议。2024 年旧版包名不同，仍独立保留。

采用可编辑 SVG 母版和可重复的 Chrome 栅格化脚本。旧 72/96/144/192 图标空白的已证实原因是 drawImage 未给目标尺寸，只截得 1024 母图左上角背景；新脚本显式缩放，逐张检查图案像素与边界，并实际目视最小 72px 文件。新目录独立保存，旧资源不删除。

普通 uni-app 使用 app-plus.distribute.splashscreen.android 与 androidStyle=default，三密度真实 NinePatch，仅拉伸标志和文字外的留白。首页渲染后自动关闭，不增加品牌展示延时。不套用 uni-app x 的 app-android 配置；Android12 系统启动层的实际外观留待安装验证。

本地已通过 13 PNG 内容/边界检查、三密度 NinePatch aapt2 编译、14 个 SFC 检查、93 项模拟 DOM 交互检查，以及 HBuilderX 5.26 生产 App 资源导出。业务算法未改，本轮没有重跑全量 Node 测试。浏览器品牌板是实际输出资源和公开测试账户的 UI 预览，不等同原生验收。

云端包产出后，必须先用 aapt2 核对名称/版本/包名、提取各密度图标检查，再请用户覆盖安装和冷启动。README 重整与 GitHub Release 后置，本轮不自动提交或推送。
