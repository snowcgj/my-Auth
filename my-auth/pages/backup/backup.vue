<template>
  <view class="backup-container">
    <text class="title">加密备份最小真机验证</text>
    <text class="desc">仅用公开演示数据 JBSWY3DPEHPK3PXP。验证：①安全随机源 ②SAF 文件 IO（ACTION_CREATE/OPEN_DOCUMENT）③加密往返 ④错密码拒绝 ⑤取消不报成功 ⑥中文/重复文件名 ⑦合并恢复写回存储。按钮 0-3、查看账户数不碰存储；按钮 4 会写回 accounts（恢复合并 skip 策略，先持久化成功再提示）。</text>

    <button @click="onMinWrite" class="btn ghost">0. 最小写入诊断（写几字节，定位 write 链路）</button>
    <button @click="onExport" class="btn primary">1. 导出测试（系统另存为）</button>
    <button @click="onRestoreCorrect" class="btn primary">2. 恢复测试（正确密码）</button>
    <button @click="onRestoreWrong" class="btn primary">3. 恢复测试（错误密码）</button>
    <button @click="onRestoreWriteBack" class="btn danger">4. 恢复并写回存储（正确密码，会修改账户存储）</button>
    <button @click="onCheckAccounts" class="btn ghost">查看当前账户数</button>
    <button @click="onClear" class="btn ghost">清空日志</button>

    <text v-if="results.length" class="section-title">结果</text>
    <view class="result-list">
      <text v-for="(r, i) in results" :key="i" class="result-line">{{ r }}</text>
    </view>
  </view>
</template>

<script>
import { createBackup, openBackup } from '@/utils/backup-crypto.js';
import { mergeAccounts } from '@/utils/backup-merge.js';
import { getRandomBytes } from '@/utils/platform-random.js';
import { pickFileForSave, pickFileForRead } from '@/utils/platform-file.js';

const PASSWORD = 'correct-horse-battery-staple';
const TEST_SECRET = 'JBSWY3DPEHPK3PXP';

function testAccount() {
  return {
    id: 1,
    icon: '/static/logo.png',
    app: 'Acme',
    name: 'alice',
    issuer: 'Acme',
    accountName: 'alice',
    secret: TEST_SECRET,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    pinned: false,
    sortOrder: 1,
    code: '',
    countdown: 30,
  };
}

export default {
  data() {
    return {
      results: [],
    };
  },
  methods: {
    log(line) {
      this.results = [...this.results, line];
    },
    onClear() {
      this.results = [];
    },
    onMinWrite() {
      this.log('--- 最小写入诊断开始（写 AB测试123 几字节）---');
      try {
        pickFileForSave('test.txt', 'AB测试123', (res) => {
          if (res.cancelled) { this.log('用户取消'); return; }
          if (res.error) { this.log('✗ 最小写入失败：' + res.error); return; }
          this.log('✓ 最小写入成功，' + res.bytes + ' 字节，读回验证 ' + (res.verified ? '✓ 通过' : '✗ 未通过'));
        });
      } catch (e) {
        this.log('✗ onMinWrite 同步异常：' + ((e && e.message) || String(e)));
      }
    },
    onExport() {
      this.log('--- 导出测试开始 ---');
      let backup;
      let t0 = Date.now();
      try {
        // 注入 platform-random 的 getRandomBytes：Android 走 SecureRandom，其他走 Web Crypto
        backup = createBackup(PASSWORD, [testAccount()], { randomBytes: getRandomBytes });
      } catch (e) {
        this.log('✗ 加密失败：' + (e.code || '') + ' ' + (e.message || e));
        this.log('  （若 NO_SECURE_RANDOM：SecureRandom Native.js 桥接未成功，需评估适配）');
        return;
      }
      const encMs = Date.now() - t0;
      this.log('✓ 加密成功，耗时 ' + encMs + 'ms（含 PBKDF2 十万次 + SecureRandom）');

      const json = JSON.stringify(backup);
      // 中文文件名：验证系统另存为对中文的处理；重复文件名由系统提示覆盖
      t0 = Date.now();
      pickFileForSave('my-auth-验证.mabak', json, (res) => {
        const ioMs = Date.now() - t0;
        if (res.cancelled) {
          this.log('✓ 用户取消另存为，未记录导出（符合预期）');
          return;
        }
        if (res.error) {
          this.log('✗ 写入失败：' + res.error + '（原账户不变）');
          return;
        }
        this.log('✓ 写入成功，IO ' + ioMs + 'ms');
        this.log('  写入 ' + (res.bytes || 0) + ' 字节，读回验证 ' + (res.verified ? '✓ 通过' : '✗ 未验证'));
        this.log('  URI=' + res.uri);
        this.log('导出总耗时 ' + (encMs + ioMs) + 'ms');
      });
    },
    onRestoreCorrect() {
      this.log('--- 恢复测试（正确密码）开始 ---');
      pickFileForRead((res) => {
        if (res.cancelled) {
          this.log('用户取消选择文件');
          return;
        }
        if (res.error) {
          this.log('✗ 读取失败：' + res.error + '（原账户不变）');
          return;
        }
        this.log('选中文件 URI：' + (res.uri || '未知'));
        this.log('读到 ' + (res.bytes || 0) + ' 字节');
        if (!res.content || res.content.length === 0) {
          this.log('✗ 读到 0 字节：选到的文件是空的。请选刚导出的 my-auth-验证.mabak（约 667 字节，在下载/Downloads 目录）');
          return;
        }
        const t0 = Date.now();
        try {
          const result = openBackup(PASSWORD, res.content);
          const ms = Date.now() - t0;
          const ok = result.accounts[0] && result.accounts[0].secret === TEST_SECRET;
          this.log(ok ? '✓ 正确密码恢复成功' : '✗ secret 不匹配');
          this.log('  解密耗时 ' + ms + 'ms，账户数 ' + result.accounts.length);
        } catch (e) {
          this.log('✗ 恢复异常：' + (e.code || '') + ' ' + (e.message || e));
        }
      });
    },
    onRestoreWrong() {
      this.log('--- 恢复测试（错误密码）开始 ---');
      pickFileForRead((res) => {
        if (res.cancelled) {
          this.log('用户取消选择文件');
          return;
        }
        if (res.error) {
          this.log('✗ 读取失败：' + res.error + '（原账户不变）');
          return;
        }
        const t0 = Date.now();
        try {
          openBackup('wrong-password', res.content);
          this.log('✗ 错误密码竟恢复成功（应被拒绝）');
        } catch (e) {
          const ms = Date.now() - t0;
          const isPw = e.code === 'PASSWORD_OR_CORRUPT';
          this.log(isPw ? '✓ 错误密码被拒绝' : '✗ 异常类型不对：' + (e.code || '') + ' ' + (e.message || e));
          this.log('  拒绝耗时 ' + ms + 'ms（仅 PBKDF2 + 验 MAC，未解密）');
        }
      });
    },
    onRestoreWriteBack() {
      // 与按钮 2/3 的区别：本按钮会修改账户存储（写回 accounts）。
      // 流程：读文件 → 解密 → 重新分配 id（避免与现有冲突）→ 合并(skip) → 先持久化成功再提示。
      // 复用 home.vue "先 persistAccounts(next) 成功再赋值 this.accounts" 约定。
      this.log('--- 恢复并写回存储开始（会修改账户存储）---');
      pickFileForRead((res) => {
        if (res.cancelled) {
          this.log('用户取消选择文件，存储未修改');
          return;
        }
        if (res.error) {
          this.log('✗ 读取失败：' + res.error + '（存储未修改）');
          return;
        }
        this.log('选中文件 URI：' + (res.uri || '未知'));
        this.log('读到 ' + (res.bytes || 0) + ' 字节');
        if (!res.content || res.content.length === 0) {
          this.log('✗ 读到 0 字节，存储未修改');
          return;
        }
        let decrypted;
        try {
          const result = openBackup(PASSWORD, res.content);
          decrypted = result.accounts;
          this.log('✓ 解密成功，备份含 ' + decrypted.length + ' 个账户');
        } catch (e) {
          this.log('✗ 解密失败：' + (e.code || '') + ' ' + (e.message || e) + '，存储未修改');
          return;
        }
        // 重新分配 id：备份里的 id 可能与现有账户冲突（去重键是 secret，不是 id，
        // secret 不同但 id 相同的账户会进 merged，导致 home v-for :key 冲突）。
        // 用 Date.now() + 索引确保新 id 唯一。
        const baseId = Date.now();
        const reid = decrypted.map((acc, i) => ({ ...acc, id: baseId + i }));
        // 读现有存储：失败立即终止，不按空数组继续合并——
        // 否则 mergeAccounts([], reid) 会用恢复数据覆盖原存储，丢失现有账户。
        let existing;
        try {
          const stored = uni.getStorageSync('accounts');
          existing = Array.isArray(stored) ? stored : [];
        } catch (e) {
          this.log('✗ 读取现有账户存储失败：' + (e.message || e) + '，已终止，存储未修改');
          return;
        }
        this.log('现有账户 ' + existing.length + ' 个');
        // 合并（skip 策略：重复 secret 保留现有，incoming 重复项进 duplicates 清单）
        const merge = mergeAccounts(existing, reid);
        this.log('合并结果：新增 ' + merge.added + ' 个，跳过 ' + merge.duplicates.length + ' 个重复');
        // 先持久化成功再提示（存储失败则不更新内存，存储保持原样）
        try {
          uni.setStorageSync('accounts', merge.merged);
        } catch (e) {
          this.log('✗ 写回存储失败：' + (e.message || e) + '，存储未修改');
          return;
        }
        this.log('✓ 已写回存储，当前共 ' + merge.merged.length + ' 个账户');
        this.log('  请切到首页 tab 查看（home onShow 已加重载 accounts）');
      });
    },
    onCheckAccounts() {
      try {
        const arr = uni.getStorageSync('accounts');
        const n = Array.isArray(arr) ? arr.length : 0;
        this.log('当前账户存储：' + n + ' 个（验证页不修改，操作前后应一致）');
      } catch (e) {
        this.log('读取账户存储失败：' + (e.message || e));
      }
    },
  },
};
</script>

<style scoped>
.backup-container {
  display: flex;
  flex-direction: column;
  padding: 20px;
  background-color: #f8f8f8;
  height: 100%;
}
.title {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 8px;
}
.desc {
  font-size: 12px;
  color: #666;
  margin-bottom: 16px;
  line-height: 1.6;
}
.btn {
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 8px;
  font-size: 15px;
  border: none;
}
.btn.primary {
  background-color: #007aff;
  color: white;
}
.btn.danger {
  background-color: #fff;
  color: #d93025;
  border: 1px solid #d93025;
}
.btn.ghost {
  background-color: #fff;
  color: #007aff;
  border: 1px solid #007aff;
}
.section-title {
  margin-top: 16px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: bold;
  color: #333;
}
.result-list {
  background-color: #fff;
  border-radius: 8px;
  padding: 12px;
}
.result-line {
  display: block;
  font-size: 12px;
  color: #333;
  line-height: 1.8;
  font-family: monospace;
}
</style>
