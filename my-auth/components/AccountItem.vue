<template>
  <view class="account-item">
    <!-- 上部分 -->
    <view class="account-header">
      <view class="account-left">
		<image :src= icon   class="account-icon" />
		<!-- <image src="https://favicon.im/hey.com" alt="hey.com favicon" /> -->
        <view class="account-info">
          <view class="account-title">
            <text class="account-app">{{ app }}</text>
            <text v-if="pinned" class="pinned-flag">置顶</text>
          </view>
          <text class="account-name">{{ name }}</text>
        </view>
      </view>

      <button @click="onMoreOptions" class="more-options-button">
        <!-- <img src="/static/logo.png" alt="More" class="icon-image" /> -->
        <uni-icons type="circle" size="30"></uni-icons>
      </button>
    
    </view>

    <!-- 下部分 -->
    <view class="account-body">

      <view class="account-code-container" @click="onCopyCode">
        <text v-if="unavailable" class="account-code-unavailable">配置不支持</text>
        <text v-else class="account-code">{{ formattedCode }}</text>
      </view>

      <view class="account-right">
        <text class="countdown">{{ countdown }} sec</text>
      </view>

    </view>
    
  </view>
</template>

<script>
// import { authenticator } from 'otplib';
// 手动设置配置项

// authenticator.options = {
//   step: 30, // 30秒间隔
//   window: 1 // 容错窗口
// };
//import sha1 from 'js-sha1';
import { generateTOTP } from '../utils/totp-core';


export default {
  props: {
    id: Number,    // 账户的唯一标识符
    icon: String,      // 图标
    app: String,       // 应用名称
    name: String,      // 用户名
    secret: String,     // TOTP 密钥
    digits: {
      type: Number,
      default: 6,
    },
    period: {
      type: Number,
      default: 30,
    },
    algorithm: {
      type: String,
      default: 'SHA1',
    },
    timestampSeconds: {
      type: Number,
      default() {
        return Math.floor(Date.now() / 1000);
      },
    },
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      code: '',         // 动态验证码
      unavailable: false, // 配置不支持时置真，卡片显示提示而非验证码
      countdown: 30,    // 倒计时
      lastWindow: null, // 上一次的时间窗口，用于判断是否需要重新生成
    };
  },
  mounted() {
    this.refresh();
  },
  watch: {
    timestampSeconds() {
      this.refresh();
    },
    period() {
      this.invalidateCode();
    },
    secret() {
      this.invalidateCode();
    },
    digits() {
      this.invalidateCode();
    },
    algorithm() {
      this.invalidateCode();
    },
  },
  computed: {
      formattedIcon() {
        // 例如：在 icon 变量的前面加上路径前缀
        return `https://favicon.im/${this.name}.com`;
        // 也可以做更多的字符串操作，例如去除空格、转小写等
        // return `https://example.com/images/${this.icon.trim().toLowerCase()}.png`;
      },
      formattedCode() {
        if (!this.code) {
          return '';
        }
        if (this.digits === 8) {
          return `${this.code.slice(0, 4)} ${this.code.slice(4)}`;
        }
        return `${this.code.slice(0, 3)} ${this.code.slice(3)}`;
      }
  },
  methods: {
    onMoreOptions() {
      const items = ['修改', this.pinned ? '取消置顶' : '置顶', '删除'];
      uni.showActionSheet({
        itemList: items,
        success: (res) => {
          if (res.tapIndex === 0) {
            this.$emit('edit-account', this.id);
          } else if (res.tapIndex === 1) {
            this.$emit('toggle-pin', this.id);
          } else if (res.tapIndex === 2) {
            this.$emit('delete-account', this.id);
          }
        },
        fail: () => {
          // 操作取消
        }
      });
    },

    onCopyCode() {
      if (this.unavailable) {
        uni.showToast({ title: '该账户配置不支持，无法生成验证码', icon: 'none' });
        return;
      }
      if (!this.code) {
        uni.showToast({ title: '验证码尚未生成', icon: 'none' });
        return;
      }
      uni.setClipboardData({
        data: this.code,
        success: () => {
          uni.showToast({ title: '已复制', icon: 'none' });
        },
      });
    },
    refresh() {
      const currentWindow = Math.floor(this.timestampSeconds / this.period);
      this.countdown = this.period - (this.timestampSeconds % this.period);
      if (currentWindow !== this.lastWindow) {
        // 先生成再更新缓存：失败时 lastWindow 不前进，下一秒可重试；
        // 配置变更由 invalidateCode 强制重算。
        this.generateCode();
        if (!this.unavailable) {
          this.lastWindow = currentWindow;
        }
      }
    },

    invalidateCode() {
      // 影响验证码的配置变更时强制重算，不受窗口缓存限制。
      this.lastWindow = null;
      this.refresh();
    },

    generateCode() {
      try {
        this.code = generateTOTP({
          secret: this.secret,
          timestampSeconds: this.timestampSeconds,
          digits: this.digits,
          period: this.period,
          algorithm: this.algorithm,
        });
        this.unavailable = false;
      } catch (error) {
        console.error('验证码生成失败：', error);
        this.code = '';
        this.unavailable = true;
      }
    },
  }



};
</script>

<style scoped>
.account-item {
  display: flex;
  flex-direction: column; /* 垂直分布，上下两部分 */
  padding: 20px;
  margin: 15px;
  background-color: #ffffff; /* 白色背景 */
  border-radius: 20px; /* 圆角设计，让卡片更柔和 */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); /* 增加卡片阴影，使其有立体效果 */
  position: relative; /* 用于内部元素（如按钮）定位 */
}
.account-header {
  display: flex; /* 水平方向排列 */
  justify-content: space-between; /* 两端对齐，图标在左，按钮在右 */
  align-items: center; /* 垂直方向居中 */
  margin-bottom: 10px; /* 下部分留一些空间 */
}

.account-left {
  display: flex; /* 图标和文字部分水平排列 */
  align-items: center; /* 垂直居中对齐 */
}

.account-icon {
  width: 50px; /* 图标的宽度和高度 */
  height: 50px;
  margin-right: 15px; /* 图标与右侧信息之间的间距 */
}

.account-info {
  display: flex;
  flex-direction: column; /* 应用名和账号名上下排列 */
}

.account-app {
  font-size: 18px;
  font-weight: bold; /* 应用名称加粗 */
}

.account-name {
  font-size: 14px;
  color: #666; /* 使用灰色以区分重要程度 */
}

.account-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pinned-flag {
  font-size: 11px;
  color: #fff;
  background-color: #007aff;
  border-radius: 4px;
  padding: 1px 6px;
}

.more-options-button {
  background: none; /* 没有背景 */
  border: none; /* 没有边框 */
  margin: 0%;
  /* width: 24;
  height: 24; */
  font-size: 20px;
  cursor: pointer; /* 鼠标移上去显示手型，表示可点击 */
  color: #999; /* 使用淡灰色，使得按钮不会过于显眼 */
  /* padding: 5px; */
  /* border-radius: 50%; */
  border: 1px solid #ddd;
}

.account-body {
  display: flex; /* 水平排列，验证码和倒计时 */
  justify-content: space-between; /* 左右两部分 */
  align-items: center; /* 垂直居中 */
  margin-top: 10px; /* 与上部分留出空间 */
}

.account-code-container {
  background-color: #f0f0f5; /* 灰色背景让验证码部分突出 */
  padding: 10px 20px; /* 内边距让验证码周围有足够的空间 */
  border-radius: 15px; /* 圆角设计，使得区域看起来更加现代 */
  text-align: center; /* 居中显示验证码 */
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1); /* 内部阴影增加视觉层次感 */
}

.account-code {
  font-size: 32px; /* 较大的字体显示验证码 */
  font-weight: bold; /* 加粗 */
  color: #333; /* 深色字体以增强可读性 */
}

.account-code-unavailable {
  font-size: 16px;
  font-weight: bold;
  color: #b00020;
}

.account-right {
  display: flex;
  align-items: flex-end; /* 使倒计时和单位对齐 */
  flex-direction: column;
}

.countdown {
  font-size: 20px;
  color: #007aff; /* 使用蓝色强调倒计时 */
  font-weight: bold; /* 加粗使其更显眼 */
}

.countdown-unit {
  font-size: 14px;
  color: #007aff;
}
</style>
