# 2026-10-27 背景主题切换：准备材料（固定颜色清点 + 机制建议 + 验证清单）

分工（主 agent 指定）：主 agent 负责配色、主题切换实现与最终视觉检查；本文档只提供支持材料，**不包含色值设计**，不改变任何代码。

需求范围：三套浅色主题（暖白 / 雾紫 / 浅绿）；首页设置按钮旁放调色板按钮，点开色卡，选择立即生效，重启保留；三页（home/backup/settings）与弹层一起适配；保持验证码、文字、警告信息清晰。本次不做深色模式、不做自定义图片背景。

## 1. 现状主题机制（已核实）

- 变量唯一定义源：`my-auth/styles/theme.css`（44 行），在 `page` 选择器上定义 6 个变量（L3-8）：
  `--auth-paper:#f7f7f2`（页面底） `--auth-ink:#252824`（近黑主色/主按钮底） `--auth-muted:#777c73`（次要文字） `--auth-line:#e7e8df`（边框） `--auth-purple:#e9e4fa`（淡紫强调） `--auth-danger:#ad5749`
  同文件 L9-10 设置 `page` 背景/字色；L1 注释：「已确认的首页视觉：暖白、淡紫、近黑。仅展示样式，不参与账户持久化。」
- 引入点：`my-auth/App.vue:16` `@import './styles/theme.css'`（全局样式，非 scoped）。
- 通用类在 theme.css：`.ui-page`（背景=变量）`.ui-panel` `.ui-section-label` `.ui-title` `.ui-description` `.ui-primary` `.ui-secondary` `.ui-icon-button` `.ui-input` `.ui-note`（警示条）等。
- 跨页一致的原因：三页根容器均用 `.ui-page`，弹层组件（AppDialog/ActionSheet/BusyOverlay/AccountNameEditor）是**页面内** fixed/absolute 节点，CSS 变量按元素继承——只要覆盖点在页面元素链上，弹层自动跟随。
- JS 动态颜色一处：`my-auth/components/AccountItem.vue:51-52` 脚本里按状态取色注入样式（`#c18a50` 倒计时紧急 / `#8a75a3` 置顶 / `#81936e` 默认；进度环 track `#d8cfe9`/`#e5e8dd`）。
- 固定不可运行时修改：`my-auth/pages.json` 各页 `backgroundColor` 与 `globalStyle` 均 `#f7f7f2`（L8/16/24/31/32）。`navigationStyle` 已全 custom，该值仍影响窗口底色与下拉露底。

## 2. 变量覆盖方案建议（供实现参考，主 agent 定夺）

- 方案 A（纯 CSS 预设类）：theme.css 中保留现有 `page` 默认值（=暖白），新增 `.theme-warm/.theme-violet/.theme-green` 三个类在同一选择器粒度覆盖变量值；三页根 `.ui-page` 绑定动态 class（页面元素可以动态改类，`page` 元素本身不能）。弹层在 `.ui-page` 内，自动继承覆盖后的变量。
- 方案 B（内联变量）：每页根 `.ui-page` 用 `:style` 绑定变量映射对象（JS 生成），全局状态由一个小模块（建议 `utils/theme.js`）管理：`getTheme()/setTheme()` + `uni.setStorageSync('ui-theme', id)`，白名单校验 `['warm','violet','green']`，非法值回退 `warm`。
- 无论哪种：需要在 `.ui-page` 层生效的变量数可能超过现有 6 个（见 §3 归并建议），建议一次扩展到位再配三套色值。
- `pages.json` 固定值处理：接受「下拉露底为暖白」作为已知限制（默认主题一致，另两套轻微差异），或后续用 `uni.setBackgroundColor` 动态补偿（App 端行为待真机验证）。建议本次先记录为限制。

## 3. 固定颜色清点表

语义分类：S=surface 卡面/面板，M=mask 遮罩，L=line 边框/分隔，T=text 文字，A=accent 强调，W=warn/warning 警示，D=danger，X=保持固定（品牌/深色元素），I=忽略（死代码）。
「建议」列：⬆=升为变量随主题，⊕=可并入现有/新增变量，✕=保持固定，○=随语义变量自动覆盖。

### theme.css 自身（已变量化部分之外）

| 位置 | 当前值 | 用途 | 语义 | 建议 |
|---|---|---|---|---|
| styles/theme.css:9-10 | #f7f7f2 / #252824 | page 底/字色 | S/T | ⊕ 已有 --auth-paper/--auth-ink，page 兜底值保持 |
| styles/theme.css:19 | #fff | .ui-panel 卡面 | S | ⬆ 新增 --auth-surface |
| styles/theme.css:29 | #ecefe4 | .ui-secondary 次按钮底 | A | ⬆ 新增 --auth-accent-2（浅绿主题需换） |
| styles/theme.css:30 | #777c73 | disabled 底/字 | S/T | ⊕ 可用 --auth-muted 变体或固定 |
| styles/theme.css:35 | #fff | .ui-icon-button 底 | S | ⊕ 归并 --auth-surface |
| styles/theme.css:39 | #f4f5ef | .ui-input 底 | S | ⬆ 新增 --auth-input-bg |
| styles/theme.css:42 | #969c8e | input placeholder | T | ⊕ 归并 --auth-muted 淡档 |
| styles/theme.css:44 | #f5f0dc / #827449 | .ui-note 警示条 | W | ⬆ 新增 --auth-warn-bg/--auth-warn-text |

### components（当前参与运行）

| 位置 | 当前值 | 用途 | 语义 | 建议 |
|---|---|---|---|---|
| AppDialog.vue:35 | rgba(37,40,36,.34) | 弹窗遮罩 | M | ⬆ 新增 --auth-mask |
| AppDialog.vue:36 | 边 #eeeee5 / 底 #fbfbf6 / 阴影 rgba(37,40,36,.12) | 弹窗面板 | S/L | ⬆ 新增 --auth-surface-raised（#fbfbf6 系弹层统一）；边⊕--auth-line |
| AppDialog.vue:38 | #f3e4dd | danger 图标底 | D | ⬆ 新增 --auth-danger-soft |
| AppDialog.vue:45 | #a75a4b / #fff | danger 确认按钮 | D | ⬆ 新增 --auth-danger-strong |
| AccountItem.vue:51 | #c18a50 / #8a75a3 / #81936e | 倒计时紧急/置顶/默认 文字+环 | W/A/T | ⬆ 语义色升变量（JS 取色处改为读 CSS 变量或由常量表按主题映射；三套主题若沿用点缀色也可 ✕，主 agent 视觉定） |
| AccountItem.vue:52 | #d8cfe9 / #e5e8dd | 进度环 track | A | 同上 |
| AccountItem.vue:85 | #fff | 账户卡面 | S | ⊕ --auth-surface |
| AccountItem.vue:86 | #ded7f0 | 置顶卡边框 | A/L | ⬆ 新增 --auth-accent-line |
| AccountItem.vue:91 | #7b718e | 置顶时账户名 | T | ⊕ --auth-muted |
| AccountItem.vue:100/102 | #7d8376 / #7e718d | 倒计时文字（默认/置顶） | T | ⊕ 归并 --auth-muted |
| AccountItem.vue:103 | #ad7040 | 倒计时紧急 | W | ⊕ --auth-warn-text 或独立 --auth-warn-strong |
| AccountItem.vue:104 | #d9ded0 | 环外圈边 | L | ⊕ --auth-line 变体 |
| AccountItem.vue:105 | #fff | 环中心点 | S | ⊕ --auth-surface |
| AccountItem.vue:107 | #92819f | 置顶提示文字 | T | ⊕ --auth-muted 淡档 |
| ServiceIcon.vue:2,19-30 | #ffffff/#c8ed9b/#f3f4ed 及 5 组字母头像配对色 | 品牌图标底/字 | X | ✕ 品牌识别色，不随主题（浅色主题下需复查对比） |
| ActionSheet.vue:28 | rgba(37,40,36,.28) | 遮罩 | M | ⊕ --auth-mask |
| ActionSheet.vue:29 | #fbfbf6 | 面板 | S | ⊕ --auth-surface-raised |
| ActionSheet.vue:30 | #daddd1 | 顶部 handle | S/L | ⬆ 新增 --auth-handle |
| BusyOverlay.vue:17 | rgba(37,40,36,.3) | 遮罩 | M | ⊕ --auth-mask |
| BusyOverlay.vue:18 | #fbfbf6 + 阴影 | 卡片 | S | ⊕ --auth-surface-raised |
| BusyOverlay.vue:20 | #e1dbe9 / #8a75a3 | 加载环 | A | ⊕ --auth-accent-line/--auth-purple 系 |
| BusyOverlay.vue:23/24 | #919985 / #9aa787 | footer 文字/圆点 | T/A | ⊕ --auth-muted/--auth-accent-2 |
| AppToast.vue:30 | #30352e / #fff | toast 深底白字 | X | ✕ 深色 toast 三主题通用（或升级变量，视觉定） |
| AccountNameEditor.vue:39/40/41 | rgba(37,40,36,.3) / #fbfbf6 / #daddd1 | 遮罩/面板/handle | M/S | ⊕ 同上三变量 |
| AccountNameEditor.vue:46 | #6e7663 | 表单 label | T | ⊕ --auth-muted 深档 |
| AccountNameEditor.vue:47 | #c9a095 | 非法输入边 | D | ⊕ --auth-danger 变体 |
| AccountNameEditor.vue:49 | #919985 | 说明文字 | T | ⊕ --auth-muted |
| AccountNameEditor.vue:50 | #f6e8e2 底 + --auth-danger 字 | 保存失败条 | D | ⊕ --auth-danger-soft |
| AccountItem copy.vue:156-241 | 旧版灰蓝系 | — | I | ○ 死副本未注册，忽略（建议列入清理清单） |

### pages

| 位置 | 当前值 | 用途 | 语义 | 建议 |
|---|---|---|---|---|
| settings.vue:66 | #ded7f0 | 品牌面板边 | A/L | ⊕ --auth-accent-line |
| settings.vue:69 | #7b718e | 品牌描述文字 | T | ⊕ --auth-muted（紫系文字在浅绿主题需换） |
| settings.vue:70 | #fff | 分组面板 | S | ⊕ --auth-surface |
| settings.vue:72 | #eef0e7 | 分组分隔线 | L | ⊕ --auth-line 变体 |
| settings.vue:73 | #f0f2e9 | 行图标底 | A | ⊕ --auth-accent-2 |
| settings.vue:74 | #eee8fa | 紫图标底 | A | ⊕ --auth-accent-soft（=现 --auth-purple 同族） |
| settings.vue:78 | #929a86 | 版本注脚 | T | ⊕ --auth-muted 淡档 |
| backup.vue:410 | #ded7f0 | 状态卡边 | A/L | ⊕ --auth-accent-line |
| backup.vue:411 | #f5efdb / #ebe3c8 | 「有未备份变更」卡 | W | ⊕ --auth-warn-bg/--auth-warn-text 族 |
| backup.vue:412/415/416 | #81748f / #81778a / #8c7b53 | 状态卡文字 | T/W | ⊕ 同上 |
| backup.vue:417 | #fff | 操作面板 | S | ⊕ --auth-surface |
| backup.vue:421 | #eee8fa / #f7edbd | 入口图标底（紫/黄） | A | ⊕ --auth-accent-soft / --auth-warn-soft |
| backup.vue:423 | #8f9881 | 隐私说明 | T | ⊕ --auth-muted |
| backup.vue:424 | #6e7663 | 表单 label | T | ⊕ --auth-muted 深档 |
| backup.vue:426 | #f0edf8 / #81758e / #92899e | 合并统计卡 | A/T | ⊕ --auth-accent-soft 族 |
| backup.vue:428 | #ecefe5/#67735b；ok #e6eedf/#4c6745；error #f6e8e2/#9b5946 | 操作消息条（默认/成功/失败） | W/D | ⬆ 新增 --auth-msg（bg/text）/ --auth-ok(bg,text) / 复用 --auth-danger-soft+--auth-error-text |
| home.vue:357 | #fff | 搜索框底 | S | ⊕ --auth-surface |
| home.vue:360 | #f1eedc / #6e684a | 备份提醒条 | W | ⊕ --auth-warn-bg/--auth-warn-text |
| home.vue:364 | #959c8c | 分组计数 | T | ⊕ --auth-muted 淡档 |
| home.vue:366 | #fff（字）+ rgba(37,40,36,.12) 阴影 | 添加按钮（底=--auth-ink） | X/T | ✕ 底随 --auth-ink，字固定白 |
| home.vue:373 | #7c856f | 恢复链接 | T | ⊕ --auth-muted |
| home.vue:375 | #939b88 | 隐私注脚 | T | ⊕ --auth-muted 淡档 |
| home.vue:381 | #f0f0e8 | 删除确认头像区 | S/A | ⊕ --auth-accent-2 |
| index.vue:50-219 | 旧版灰系 | — | I | ○ 死页面未注册，忽略 |

### pages.json（不可运行时改）

| 位置 | 当前值 | 说明 |
|---|---|---|
| pages.json:8/16/24 | #f7f7f2 | 各页窗口底色（custom 导航下仍作用于下拉露底/滚动过界） |
| pages.json:31-32 | #f7f7f2 | globalStyle 同上 |

### 文字色归并建议

现状文字色分散在 #6e7663/#67735b/#7b718e/#7c856f/#7d8376/#81748f/#81778a/#81758e/#8f9881/#919985/#92819f/#929a86/#939b88/#959c8c/#92899e 等十几个近似值。建议三套主题前先归并为两档（如 --auth-muted、--auth-subtle），否则每套主题要维护十余个色值且对比度难以保证。警示/成功/危险三族（W/D/ok）同样建议各归并为一组 bg+text。

## 4. 交互与持久化建议（实现参考）

- 入口：home 的 AppHeader 区（`my-auth/pages/home/home.vue:145` openSettings 附近）加一个 `.ui-icon-button` 调色板按钮；点开色卡（可复用 ActionSheet 或轻量弹层，视觉由主 agent 定）。
- 状态与持久化：`utils/theme.js`（建议）：`THEMES=['warm','violet','green']`、`getTheme()`（getStorageSync('ui-theme')，白名单校验回退 'warm'）、`setTheme(id)`（写存储 + 通知）。切换后当前页立即生效（响应式），重启由各页 onShow/mounted 读取恢复。
- 需要绑定的位置：三页根 `.ui-page`（class 或 style 二选一，见 §2）。弹层无需单独处理（继承）。
- 存储键与 `accounts`、`backup_meta` 隔离，写入不触碰账户数据；主题值必须白名单校验（存储损坏/脏值回退默认，不抛错）。

## 5. 验证清单（实现完成后执行；主 agent 视觉检查 + 下列功能项）

功能与持久化：
1. 色卡按钮在首页可见、点开/关闭正常；三张色卡各选一次均立即生效（无重启）。
2. 选择主题后完全杀进程重启：三页与弹层均为所选主题；`ui-theme` 存储脏值（手改非法字符串）时回退暖白且不报错。
3. 切换主题不改变 `accounts`/`backup_meta`（可在开发者工具/真机存储中核对）。

一致性（3 主题 × 4 场景矩阵）：
4. 三页（home/backup/settings）背景、卡片、分组、边框一致。
5. 五个弹层（AppDialog、ActionSheet、BusyOverlay、AccountNameEditor、AppToast）逐一在所选主题下打开检查。
6. 置顶卡片（--auth-purple 系）与浅绿/雾紫主题不冲突；ServiceIcon 品牌色仍清晰。
7. 备份页三种状态卡（正常/有未备份变更/恢复预览）在每套主题下可读。

可读性（主 agent 视觉验收重点）：
8. 验证码大字、账户名、倒计时在浅绿/雾紫底上的对比度；倒计时 ≤5s 的紧急橙（#c18a50 或其变量化后）在每套主题可辨。
9. 警示条三族（备份提醒、保存失败、操作消息 error/ok）在每套主题下文字清晰。
10. disabled 按钮态、input placeholder 可读。

边界与回归：
11. 下拉/滚动过界露出的窗口底色（pages.json 固定 #f7f7f2）与当前主题的割裂程度——记录为已知限制或用 `uni.setBackgroundColor` 补偿（App 端行为待真机验证）。
12. Android 真机（CSS 变量在 App-vue 页面与 fixed 弹层中的继承）全流程回归：添加→复制→置顶→重命名→删除→备份→恢复。
13. 微信小程序/H5 端 CSS 变量与 `env(safe-area-inset-bottom)` 行为抽查（只需不明显破坏）。

## 备注

- 本文档为准备材料，不构成决策记录；实现方案与色值由主 agent 确认后落地，若形成正式决策应另立 `.ai/decisions/2026-MM-DD-主题切换.md`。
- 清点基于 2026-10-27 只读 grep（pattern：`#[0-9a-fA-F]{3,8}\b|rgba?\(` 与 `var\(--auth-[a-z-]+\)`，范围 pages/components/styles/pages.json）。
