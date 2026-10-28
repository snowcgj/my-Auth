# 芝码品牌资源

`mark.svg` 是可编辑的矢量母版：圆润小门、芝麻形钥匙孔与叶子。`icon.svg` 和 PNG 由脚本生成；桌面图标使用完整淡紫方形底，不预裁系统圆角。

从仓库根目录重新生成（Node.js 22、已安装 Chrome、Windows 微软雅黑字体）：

```powershell
node my-auth/scripts/generate-brand-assets.mjs
```

可用 `--chrome PATH` 指定 Chrome，用 `--scratch PATH` 指定仓库外临时目录。Chrome 仅用于开发时栅格化，不是应用运行依赖。

- `icon-72/96/144/192.png`：Android hdpi/xhdpi/xxhdpi/xxxhdpi。
- 256/384/512/1024 图标：后续展示与导出用。
- `mark-96/192.png`：应用内透明标识。
- `splash-*.9.png`：三密度原生启动图，包含真正的 1px NinePatch 标记；只拉伸标识和文字之外的纯色留白，不可裁掉边框后仍按 NinePatch 使用。

生成器显式缩放到目标画布，并检查每张 PNG 的图案像素和边界，避免旧导出脚本的小画布截取问题。13 张 PNG 检查、三张启动图的 Android aapt2 编译、本地 HBuilderX 生产资源编译均已通过；最终 APK 的图标与冷启动仍须提取检查及真机验收。

旧 `static/app-icons` 暂留存，不再被 Android 配置引用。显示名改为芝码，包名、DCloud appid、数据键和备份格式保持原值。
