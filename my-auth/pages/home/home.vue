<template>
  <view class="home-container">
    <!-- 最顶部的 -->
      <view class="header">
          <view class="logo-container">
            <image src="/static/logo.png" class="logo"></image>
            <text class="app-name">Auth</text>
          </view>
          <view class="icons">
            <button @click="onHelp" class="icon-button">❓</button>
            <button @click="onImport" class="icon-button">📥</button>
            <button @click="onExport" class="icon-button">📤</button>
          </view>
        </view>
       <!-- <button @click="saveAccounts">dd</button> -->
    <view class="search-bar">
      <input
        :value="keyword"
        @input="onSearchInput"
        class="search-input"
        placeholder="搜索服务或账户"
      />
    </view>

    <!-- 账号列表 -->
    <view class="account-list">
      <AccountItem
        v-for="account in displayAccounts"
        :key="account.id"
        :id="account.id"
        :icon="account.icon"
        :app="account.app"
        :name="account.name"
        :secret="account.secret"
        :digits="account.digits"
        :period="account.period"
        :algorithm="account.algorithm"
        :pinned="account.pinned"
        :timestamp-seconds="now"
        @delete-account="onDeleteAccount"
        @edit-account="onEditAccount"
        @toggle-pin="onTogglePin"
      />
      <view v-if="displayAccounts.length === 0" class="empty-tip">
        <text>没有匹配的账户</text>
      </view>
    </view>

    <!-- 浮动添加按钮 -->
    <button @click="onAddAccount" class="floating-button">＋</button>
  </view>
</template>

<script>
import AccountItem from '@/components/AccountItem.vue';
import { parseOtpAuthUri } from '@/utils/otpauth.js';
import { normalizeAccount } from '@/utils/account.js';


export default {
  components: {
    AccountItem,
  },
  data() {
    return {
      now: Math.floor(Date.now() / 1000),
      timer: null,
      keyword: '',
      accounts: [],
    };
  },
  mounted() {
    this.startClock();
    this.loadAccounts();
  },
  onShow() {
    // 回到前台时立即刷新时间，避免后台节流导致验证码停留在旧窗口
    this.now = Math.floor(Date.now() / 1000);
    // 重载账户：任何来源的存储变更（恢复、导入）都能在切回首页时反映。
    // 账户数据量小，重载成本可忽略；loadAccounts fail 时置空不覆盖存储。
    this.loadAccounts();
  },
  beforeUnmount() {
    this.stopClock();
  },
  computed: {
    displayAccounts() {
      const keyword = this.keyword.trim().toLowerCase();
      const filtered = keyword
        ? this.accounts.filter(account => {
            const text = [account.app, account.name, account.issuer, account.accountName]
              .filter(value => value)
              .join(' ')
              .toLowerCase();
            return text.includes(keyword);
          })
        : this.accounts.slice();

      return filtered.sort((previous, next) => {
        if (previous.pinned !== next.pinned) {
          return previous.pinned ? -1 : 1;
        }
        if (previous.sortOrder !== next.sortOrder) {
          return previous.sortOrder - next.sortOrder;
        }
        return previous.id - next.id;
      });
    },
  },
  methods: {
    startClock() {
      this.stopClock();
      this.timer = setInterval(() => {
        this.now = Math.floor(Date.now() / 1000);
      }, 1000);
    },

    stopClock() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },

    loadAccounts() {
      // 读取本地账户；getStorage 的 fail 无法区分"无数据"与"真实错误"，
      // 故 fail 时按空列表处理。已移除深度 watcher，不会在读取时回写覆盖原存储。
      uni.getStorage({
        key: 'accounts',
        success: (res) => {
          const stored = Array.isArray(res.data) ? res.data : [];
          this.accounts = stored.map(account => normalizeAccount(account));
        },
        fail: () => {
          this.accounts = [];
        },
      });
    },

    onSearchInput(event) {
      this.keyword = event.detail.value;
    },

    // 删除账户
    onDeleteAccount(accountId) {
      const account = this.accounts.find(item => item.id === accountId);
      if (!account) {
        return;
      }

      uni.showModal({
        title: '删除账户',
        content: `${account.app} / ${account.name}`,
        confirmText: '删除',
        cancelText: '取消',
        success: (result) => {
          if (!result.confirm) {
            return;
          }
          const next = this.accounts.filter(item => item.id !== accountId);
          if (!this.persistAccounts(next)) {
            uni.showToast({ title: '保存失败，删除未生效', icon: 'none' });
            return;
          }
          this.accounts = next;
        },
      });
    },

    onTogglePin(accountId) {
      const next = this.accounts.map(account =>
        account.id === accountId
          ? { ...account, pinned: !account.pinned }
          : account
      );
      if (!this.persistAccounts(next)) {
        uni.showToast({ title: '保存失败，置顶未生效', icon: 'none' });
        return;
      }
      this.accounts = next;
    },

    // 修改账户，跳转到编辑页面
    onEditAccount(accountId) {
      uni.showToast({
        title: '功能暂未开发，敬请期待',
        //将值设置为 success 或者直接不用写icon这个参数
        icon: 'error',
        //显示持续时间为 2秒
        duration: 2000
      })  
      // const account = this.accounts.find(account => account.id === accountId);
      // console.log("修改账户的：")
      // console.log(this.accounts)
      // uni.navigateTo({
      //   url: `/pages/other/edit-account?id=${accountId}`
      //   // url: `/pages/other/edit-account`
      // });
    },

    saveAccountsToStorage() {
      const accountsStr = JSON.stringify(this.accounts);

      // 针对不同平台的存储
      if (process.env.VUE_APP_PLATFORM === 'h5') {
        // H5 平台：使用 localStorage
        localStorage.setItem('accounts', accountsStr);
        console.log('Accounts saved to localStorage successfully!');
      } else {
        // APP 和小程序：使用 FileSystemManager
        const filePath = `${uni.env.USER_DATA_PATH}/accounts.json`;
        uni.getFileSystemManager().writeFile({
          filePath,
          data: accountsStr,
          encoding: 'utf8',
          success: () => {
            console.log('Accounts saved to file successfully!');
          },
          fail: (err) => {
            console.error('Failed to save accounts:', err);
          },
        });
      }
    },
    loadAccountsFromStorage() {
      // 针对不同平台的读取逻辑
      if (process.env.VUE_APP_PLATFORM === 'h5') {
        // H5 平台：使用 localStorage
        const accountsStr = localStorage.getItem('accounts');
        if (accountsStr) {
          this.accounts = JSON.parse(accountsStr);
        }
      } else {
        // APP 和小程序：使用 FileSystemManager
        const filePath = `${uni.env.USER_DATA_PATH}/accounts.json`;
        uni.getFileSystemManager().readFile({
          filePath,
          encoding: 'utf8',
          success: (res) => {
            this.accounts = JSON.parse(res.data);
          },
          fail: (err) => {
            console.error('Failed to load accounts:', err);
          },
        });
      }
    },
    myfunc(){
      console.log(process.env.VUE_APP_PLATFORM);
    },
    onExport(){
      uni.showToast({
        title: '功能暂未开发，敬请期待',
        //将值设置为 success 或者直接不用写icon这个参数
        icon: 'error',
        //显示持续时间为 2秒
        duration: 2000
      })  
    },
    onHelp() {
      uni.showToast({
        title: '功能暂未开发，敬请期待',
        //将值设置为 success 或者直接不用写icon这个参数
        icon: 'error',
        //显示持续时间为 2秒
        duration: 2000
      })
      console.log('帮助功能被点击');
    },
    onImport() {
      uni.showToast({
        title: '功能暂未开发，敬请期待',
        //将值设置为 success 或者直接不用写icon这个参数
        icon: 'error',
        //显示持续时间为 2秒
        duration: 2000
      })  
    },
    // onEditAccount(account) {
    //   console.log('编辑账户', account);
    // },
    onMoreOptions(account) {
      // 预留入口，不输出账户对象
    },

    onAddAccount() {
      uni.showActionSheet({
      itemList: ['扫描二维码'], // 提示选项
      success: (res) => {
          this.scanQRCode(); // 调用扫描二维码功能
      },
      fail: (err) => {
        console.error('操作取消：', err);
      }
      // uni.showActionSheet({
      // itemList: ['扫描二维码', '选择图片'], // 提示选项
      // success: (res) => {
      //   if (res.tapIndex === 0) {
      //     this.scanQRCode(); // 调用扫描二维码功能
      //   } else if (res.tapIndex === 1) {
      //     this.selectImage(); // 调用选择图片功能
      //   }
      // },
      // fail: (err) => {
      //   console.error('操作取消：', err);
      // }
    });
    },
    scanQRCode() {
      uni.scanCode({
        success: (res) => {
          this.parseQRCode(res.result);
        },
        fail: (err) => {
          console.error('扫描失败：', err);
          uni.showToast({ title: '扫描失败，请重试', icon: 'none' });
        }
      });
    },

    selectImage() {
      uni.chooseImage({
        count: 1,
        success: (res) => {
          const filePath = res.tempFilePaths[0];
          this.decodeQRCode(filePath); // 调用解析图片二维码方法
        },
        fail: (err) => {
          console.error('选择图片失败：', err);
          uni.showToast({ title: '选择图片失败', icon: 'none' });
        }
      });
    },
    parseQRCode(data) {
      let parsed;
      try {
        parsed = parseOtpAuthUri(data);
      } catch (error) {
        uni.showToast({ title: '无法识别或不支持的二维码', icon: 'none' });
        return;
      }

      this.addAccount({
        id: Date.now(),
        icon: '/static/logo.png',
        app: parsed.issuer || parsed.accountName,
        name: parsed.accountName,
        issuer: parsed.issuer,
        accountName: parsed.accountName,
        secret: parsed.secret,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
        pinned: false,
        sortOrder: Date.now(),
        code: '',
        countdown: 30,
      });
    },
    addAccount(account) {
      const next = [...this.accounts, account];
      if (!this.persistAccounts(next)) {
        uni.showToast({ title: '保存失败，未添加账户', icon: 'none' });
        return;
      }
      this.accounts = next;
      uni.showToast({ title: '账户添加成功', icon: 'success' });
    },
    // saveAccounts() {
    //     // 将 accounts 数组存储到本地
    //     uni.setStorage({
    //       key: 'accounts', // 存储的键名
    //       data: this.accounts, // 存储的数据
    //       success: () => {
    //         console.log('账户数据已成功保存到本地');
    //       },
    //       fail: (err) => {
    //         console.error('保存账户数据失败：', err);
    //       }
    //     });
    // },
    persistAccounts(nextAccounts) {
      // 同步写入并返回结果；调用方据此决定是否更新内存与提示。
      try {
        uni.setStorageSync('accounts', nextAccounts);
        return true;
      } catch (error) {
        console.error('账户数据存储失败');
        return false;
      }
    },
    getIcon(appName) {
      // 将应用名称转为小写并拼接为 Iconify 的图标名称
      const iconName = `mdi:${appName.toLowerCase()}`;
      return iconName; // 动态生成图标名称
    },

   } 

};

</script>

<style scoped>


.home-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #f0f0f5;

}


.app-name{
align-self: center;

}

.logo {
  width: 50px; /* 图标的宽度和高度 */
  height: 50px;
  margin: 15px; /* 图标与右侧信息之间的间距 */
}

.header{
display: flex;
flex-direction: row;
justify-content: space-between; 
background-color: aquamarine;
}
.logo-container{
display: flex;
flex-direction: row;
}

.icons{
margin: 15px;
display: flex;
flex-direction: row;
justify-content: center;

}

.icon-button{
  margin:5px
}

.floating-button{
  border-radius: 20%;
  position: fixed;
  right: 20px;
  bottom: 60px;
  transition: width 0.5s, height 0.5s;
}

/* 其余的样式保持不变 */

/* 在页面或组件的 style 中 */
.account-list {
  height: 600px;            /*根据需要设置固定高度 */
  flex-grow: 1; /* 占满剩余空间 */
  overflow-y: auto; /* 垂直滚动 */
  -webkit-overflow-scrolling: touch; /* 增加滚动的平滑效果 */
  scrollbar-width: none; /* 隐藏滚动条（针对 Firefox） */
}

.account-list::-webkit-scrollbar {
  display: none; /* 隐藏滚动条（针对 WebKit 浏览器） */
}

.search-bar {
  padding: 8px 15px;
  background-color: #ffffff;
  border-bottom: 0.5px solid #e0e0e0;
}

.search-input {
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  background-color: #f0f0f5;
  font-size: 14px;
}

.empty-tip {
  padding: 40px 0;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
