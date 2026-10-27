# uni-app Native.js SAF 写文件 0kb 问题 — 求助总结

> **更新状态（2026-10-27）**：本文件原为求助总结，后续真机验证已定位根因并跑通完整链路。结论见文末「结论与验证结果」。下方 §1-§10 为求助时的原始内容，保留供回溯，但其中的推断（如"三参数 callback 正常"）已被后续观测更新——请以文末结论为准。

> 用途：贴给外部 LLM（GPT 等）或社区分析。下文为客观陈述，含已验证基线、问题现象、三种已试写法、怀疑点。

## 1. 环境

- 框架：uni-app + Vue 3，HBuilderX 5.26 作为 IDE/打包工具
- 运行端：Android 真机（5+ Runtime，Native.js 桥接 Java）
- 加密库：crypto-js@4.2.0（已验证真机可加载、AES/PBKDF2/HMAC 可运算）
- Android 版本：**未知**（未采集）
- 5+ Runtime 版本：未知

## 2. 目标

用 Android SAF（`Intent.ACTION_CREATE_DOCUMENT`）让用户选择保存位置，通过 `ContentResolver.openOutputStream(contentUri)` 拿到的 `OutputStream` 写入一段加密后的 JSON 字符串（约 1-3 KB）到文件。不将 `content://` URI 转为文件路径，不申请全盘存储权限。

## 3. 已验证可用的 Native.js 基线（重要对比）

下列 API 在同一真机、同一运行时下**已确认正常工作**，可作为对照基线：

- `plus.android.importClass('java.security.SecureRandom')` + `new SecureRandom()` + `sr.nextBytes(byteArray)`
- 创建 Java byte[]：`plus.android.invoke('java.lang.reflect.Array', 'newInstance', plus.android.importClass('java.lang.Byte').TYPE, n)`
- 读取 byte[] 元素：`plus.android.invoke(ArrayCls, 'get', byteArray, i)`
- `plus.android.runtimeMainActivity()`
- `Activity.startActivityForResult(intent, requestCode, callback)` —— ~~**带 callback 的三参数版本，callback 正常触发**~~ **【已更正 2026-10-27】本机实测三参数版本 callback 不触发；改两参数 + `Activity.onActivityResult` 覆盖后触发。详见文末结论。此条为求助时的误判。**
- `data.getData()` 返回 `content://` URI
- `Activity.getContentResolver()`
- `resolver.openOutputStream(uri)` —— 返回 OutputStream 对象，**不抛错**
- `plus.android.invoke(obj, 'methodName', ...args)` —— 调用机制可用（SecureRandom 全靠它）

**结论**：`plus.android.invoke` 调用机制、`reflect.Array` 创建/读取 byte[]、`startActivityForResult` callback、`openOutputStream` 拿到 out 对象 —— 这些都可用。createBackup 加密成功（耗时约 3s）即证明 SecureRandom 这条链完全可用。

## 4. 问题

写入后文件 **0 KB**。日志显示"写入关闭流成功"——即 `write` / `flush` / `close` **均未抛错**，callback 走成功分支，但实际文件为空。

读端（`ACTION_OPEN_DOCUMENT` + `openInputStream`）用 `Scanner.useDelimiter('\\A')` 时选文件后无反应（callback 内阻塞或 Scanner 卡住）；用 `BufferedReader.readLine` 和 `ByteArrayOutputStream + read(byte[])` 未单独验证（因导出 0kb，恢复读空文件）。

## 5. 已尝试的三种写入写法（均 0kb）

`content` 是一个 JS string（加密后的 JSON，约 1-3 KB），`out` 是 `resolver.openOutputStream(uri)` 返回的 OutputStream。

### 写法 1（链式调用 getBytes + write）

```js
const JString = plus.android.importClass('java.lang.String');
const jbytes = new JString(content).getBytes('UTF-8');  // byte[]
out.write(jbytes);
out.flush();
out.close();
```

### 写法 2（OutputStreamWriter 写字符串）

```js
const OutputStreamWriter = plus.android.importClass('java.io.OutputStreamWriter');
const writer = new OutputStreamWriter(out, 'UTF-8');
writer.write(content);
writer.flush();
writer.close();
```

### 写法 3（显式 invoke + 三参数 write(byte[], int, int)）

```js
const JString = plus.android.importClass('java.lang.String');
const jstr = new JString(content);
const jbytes = plus.android.invoke(jstr, 'getBytes', 'UTF-8');
const ArrayCls = plus.android.importClass('java.lang.reflect.Array');
const len = plus.android.invoke(ArrayCls, 'getLength', jbytes);
plus.android.invoke(out, 'write', jbytes, 0, len);
plus.android.invoke(out, 'flush');
plus.android.invoke(out, 'close');
```

## 6. 现象细节

- callback 走成功分支（`write` / `flush` / `close` 全程不抛错）
- 文件实际 0 KB
- 与 SecureRandom 对比：SecureRandom 用 `plus.android.invoke` + `reflect.Array` 同套写法正常工作，说明调用机制本身没坏

## 7. 关键诊断信号（未采集，望确认）

在写法 3 中，代码计算了 `len = reflect.Array.getLength(jbytes)` 并回传给 UI 显示"写入字节数"。**用户尚未报告该数字**。这是分水岭：

- 若 `len === 0` → `new JString(content).getBytes('UTF-8')` 返回空，问题在 **JS string → Java byte[]** 转换
- 若 `len > 0`（几 KB）→ byte[] 有内容，问题在 **`out.write` 没真正落盘**（write 调用了但没写入）

请用户报告"写入字节数"显示的实际数字。

## 8. 怀疑点

1. `new JString(content)` 中 JS string 是否正确转为 Java String（HBuilderX 的 plus.android 对 String 构造的 JS string 参数转换）
2. `.getBytes('UTF-8')` 是否返回真正的 Java byte[]（可能返回空数组或某种 JS 包装对象而非标准 `byte[]`）
3. `out.write(byte[], int, int)` 是否真正写入 —— 尽管 SecureRandom 的 `nextBytes(byte[])` 传 byte[] 是 work 的，但 `write` 有多个重载（`write(int)` / `write(byte[])` / `write(byte[], int, int)`），Native.js 重载选择可能仍选错
4. `openOutputStream(uri)` 返回的 out 对象实际类型，是否需要特殊处理
5. ContentResolver 写入是否需要某种 commit/close 提交才落盘
6. URI 权限：`ACTION_CREATE_DOCUMENT` + `FLAG_GRANT_WRITE_URI_PERMISSION` 是否授予了持久写权限（但 openOutputStream 没抛错，理论上权限 OK）
7. 是否存在 `out` 需要先 `flush` 后 `getFD().sync()` 之类的强制落盘

## 9. 求助问题

1. 三种写法为什么都 0kb？最可能的根因是什么？
2. 在 uni-app/HBuilderX 5+ 的 Native.js 里，如何可靠地把一个字符串写入 `ContentResolver.openOutputStream(uri)` 返回的 OutputStream？请给可直接用的代码。
3. 是否有更可靠的 Native.js 写入模式（例如先写到应用私有目录的 `plus.io` 文件，再用 `ContentResolver` 把文件复制到 SAF URI）？
4. 如何进一步诊断 —— 应该 `console.log` 哪些值（out 的类名、jbytes 的类型、len 的值等）来定位？

## 10. 约束（不可违背）

- 不申请全盘存储权限（`READ/WRITE_EXTERNAL_STORAGE`）
- 不将 `content://` URI 强转为文件路径
- 不以系统分享作为主导出方式
- 不降级到不明确的 `_downloads` 路径
- 不改成明文导出（加密层已验证可用，问题在 IO 写入）

## 11. 结论与验证结果（2026-10-27 真机已跑通）

> 以下为后续真机验证的结论。§1-§10 为求助时的原始内容，保留供回溯，但其中推断以本节为准。

### 根因（本机观测，非框架通则）

测试环境：HBuilderX 5.26 + 5+ Runtime + Android 真机（具体机型/runtime 版本未采集）。

1. **`startActivityForResult` 三参数带 callback 版本在本机不触发回调**。求助时（§3）误判为"正常触发"，是因为当时把别的成功路径归因到了它。实际真机日志证据：`pickFileForSave starting` → `App Hide` → `App Show`，但 `save triggered` 从不打印。改两参数 `startActivityForResult(intent, code)` + `Activity.onActivityResult = function(requestCode, resultCode, data) {...}` 覆盖 + `plus.android.importClass(data)`（data 是 Java Intent，必须 importClass 后才能调 `getData()`）后，回调正常触发。**未在其他 runtime 版本/机型验证；不排除三参数版本在别的环境正常。**

2. **`plus.android.invoke(input, 'read', buf)`（read(byte[]) 带数组参数）静默失败返回 undefined**。GPT 关键纠正：`plus.android.invoke` 方法不存在或参数不匹配时**返回 undefined 而非抛异常**，"没抛错≠成功"。`undefined > 0` 为 false，循环不执行，total=0。改逐字节 `read()` 无参（导出端 verify 已验证此法 work，667 字节逐字节比对一致）+ `utf8Decode`（优先 TextDecoder，fallback 手写 UTF-8 解码）。**不排除其他方法/参数组合（如 write(byte[])）另有表现；本机仅验证了 read(byte[]) 不可用、read() 无参可用。**

### 有效绕行方案（已真机验证 work）

- **写入**：JS 内 UTF-8 编码（`utf8Bytes` 用 `encodeURIComponent`）→ `BufferedOutputStream` → 逐字节 `write(int)` → `flush` → `close` → `openInputStream` → 逐字节 `read()` 读回比对（verified）。
- **读取**：`openInputStream` → 逐字节 `read()` 无参 → 累积到 JS 数组 → `utf8Decode` 解码。
- **回调**：两参数 `startActivityForResult` + `Activity.onActivityResult` 覆盖 + `plus.android.importClass(data)`。

### 验证结果

- 导出：667 字节真实备份，逐字节 write + 读回 verify 比对一致，**verified 通过**。
- 恢复：读到 667 字节，openBackup 正确密码解密成功，mergeAccounts 合并写回存储，home onShow 重载显示恢复账户。
- 性能：667 字节真实 IO 约 1.6s（write 0.5s + verify 0.5s + 恢复 read 0.65s），可接受，无需优化批量读写。页面显示"IO 8870ms"含用户在系统对话框选位置的约 7.2s。

### 尚未证实 / 未验证

- 三参数 `startActivityForResult` callback 在其他 runtime 版本/机型是否正常——未验证。
- `write(byte[])` / 其他带数组参数的 Native.js 调用是否同样静默失败——未系统验证（仅观测到 read(byte[]) 不可用）。
- 文件管理器显示 0 B 是 Downloads provider 元数据未刷新（SAF 新建文件 size 记录不实时），不代表真实内容——这是观测推断，未深入验证 provider 机制。

### 实现位置

- `utils/platform-file.js`：`writeSafJsonVerified`（写入 + 读回验证）、`pickFileForSave`/`pickFileForRead`（onActivityResult 覆盖）、`utf8Decode`（手写 UTF-8 fallback）。
- `utf8Bytes`（JS 内 UTF-8 编码）同文件内。
