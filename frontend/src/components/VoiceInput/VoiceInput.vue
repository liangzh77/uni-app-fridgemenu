<template>
  <view class="voice-input-container">
    <!-- 录音按钮 -->
    <view
      class="voice-button"
      :class="{ recording: isRecording || isStarting }"
      @touchstart="startRecording"
      @touchend="stopRecording"
      @touchcancel="cancelRecording"
    >
      <view class="voice-icon">
        <image
          v-if="!isRecording && !isStarting"
          src="/static/icons/mic.png"
          mode="aspectFit"
          class="icon-image"
        />
        <view v-else class="recording-animation">
          <view v-for="i in 3" :key="i" class="wave" :style="{ animationDelay: `${i * 0.1}s` }"></view>
        </view>
      </view>
      <text class="voice-text">
        {{ isRecording || isStarting ? '松开结束' : '按住说话' }}
      </text>
    </view>

    <!-- 录音状态提示 -->
    <view v-if="isRecording" class="recording-status">
      <view class="timer">{{ formatTime(recordingTime) }}</view>
      <view class="tip">上滑取消录音</view>
    </view>

    <!-- 识别状态提示 -->
    <view v-if="isProcessing" class="processing-status">
      <view class="loading-spinner"></view>
      <text>正在识别...</text>
    </view>

    <!-- 错误提示 -->
    <view v-if="errorMessage" class="error-message">
      <text>{{ errorMessage }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// Props定义
const props = defineProps({
  maxDuration: {
    type: Number,
    default: 60 // 最长60秒
  },
  minDuration: {
    type: Number,
    default: 1 // 最短1秒
  }
});

// Emits定义
const emit = defineEmits(['voiceResult', 'voiceStart', 'voiceEnd', 'voiceError']);

// 状态
const isRecording = ref(false);
const isStarting = ref(false); // 新增：正在启动录音
const isProcessing = ref(false);
const recordingTime = ref(0);
const errorMessage = ref('');
const recorderManager = ref(null);
const timerInterval = ref(null);
const startY = ref(0);

// 格式化时间
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// 初始化录音管理器
onMounted(() => {
  // #ifdef MP-WEIXIN
  recorderManager.value = uni.getRecorderManager();

  // 录音开始
  recorderManager.value.onStart(() => {
    console.log('录音开始');
    isStarting.value = false;
    isRecording.value = true;
    recordingTime.value = 0;
    errorMessage.value = '';
    emit('voiceStart');

    // 开始计时
    timerInterval.value = setInterval(() => {
      recordingTime.value++;
      if (recordingTime.value >= props.maxDuration) {
        stopRecording();
      }
    }, 1000);
  });

  // 录音结束
  recorderManager.value.onStop((res) => {
    console.log('录音结束:', res);
    clearInterval(timerInterval.value);
    isRecording.value = false;
    emit('voiceEnd');

    if (recordingTime.value < props.minDuration) {
      errorMessage.value = '录音时间太短，请重试';
      return;
    }

    // 调用语音识别
    recognizeVoice(res.tempFilePath);
  });

  // 录音错误
  recorderManager.value.onError((err) => {
    console.error('录音错误:', err);
    clearInterval(timerInterval.value);
    isStarting.value = false;
    isRecording.value = false;
    errorMessage.value = '录音失败，请检查麦克风权限';
    emit('voiceError', err);
  });
  // #endif
});

// 清理
onUnmounted(() => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
  }
});

// 开始录音
const startRecording = (e) => {
  console.log('startRecording 被调用');
  // #ifdef MP-WEIXIN
  startY.value = e.touches[0].clientY;
  isStarting.value = true; // 标记正在启动录音
  console.log('isStarting 设为 true');

  // 检查录音权限
  uni.authorize({
    scope: 'scope.record',
    success: () => {
      console.log('录音权限已授权，开始录音');
      recorderManager.value.start({
        duration: props.maxDuration * 1000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3'
      });
    },
    fail: () => {
      console.log('录音权限授权失败');
      isStarting.value = false;
      errorMessage.value = '请授权录音权限';
      uni.showModal({
        title: '提示',
        content: '需要录音权限才能使用语音输入功能',
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            uni.openSetting();
          }
        }
      });
    }
  });
  // #endif

  // #ifndef MP-WEIXIN
  errorMessage.value = '语音输入仅支持微信小程序';
  // #endif
};

// 停止录音
const stopRecording = (e) => {
  console.log('stopRecording 被调用, isStarting:', isStarting.value, 'isRecording:', isRecording.value);

  // 如果正在启动但还没真正开始，重置状态
  if (isStarting.value && !isRecording.value) {
    console.log('录音还没开始，重置 isStarting');
    isStarting.value = false;
    return;
  }

  if (!isRecording.value) {
    console.log('不在录音状态，直接返回');
    return;
  }

  // #ifdef MP-WEIXIN
  // 检查是否上滑取消
  if (e && e.changedTouches && e.changedTouches[0]) {
    const endY = e.changedTouches[0].clientY;
    if (startY.value - endY > 50) {
      console.log('上滑取消');
      cancelRecording();
      return;
    }
  }

  console.log('调用 recorderManager.stop()');
  recorderManager.value.stop();
  // #endif
};

// 取消录音
const cancelRecording = () => {
  if (!isRecording.value) return;

  // #ifdef MP-WEIXIN
  recorderManager.value.stop();
  // #endif

  clearInterval(timerInterval.value);
  isRecording.value = false;
  recordingTime.value = 0;
  errorMessage.value = '已取消录音';

  setTimeout(() => {
    errorMessage.value = '';
  }, 2000);
};

// API 基础地址
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// 上传音频到后端进行语音识别
const recognizeVoice = async (filePath) => {
  isProcessing.value = true;

  // #ifdef MP-WEIXIN
  try {
    console.log('上传音频文件进行识别:', filePath);

    // 使用 uni.uploadFile 上传音频到后端
    const uploadResult = await new Promise((resolve, reject) => {
      uni.uploadFile({
        url: `${API_BASE_URL}/api/voice/recognize`,
        filePath: filePath,
        name: 'audio',
        formData: {
          // 可以传递用户信息
        },
        success: (res) => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(res.data);
              resolve(data);
            } catch (e) {
              reject(new Error('解析响应失败'));
            }
          } else {
            reject(new Error(`请求失败: ${res.statusCode}`));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });

    console.log('语音识别结果:', uploadResult);
    isProcessing.value = false;

    if (uploadResult.success && uploadResult.data) {
      const { text, ingredients } = uploadResult.data;

      if (text && text.trim()) {
        // 返回识别的文本和解析的食材
        emit('voiceResult', text, ingredients);
      } else {
        errorMessage.value = '未识别到内容，请重试';
      }
    } else {
      errorMessage.value = uploadResult.message || '语音识别失败，请重试';
    }
  } catch (err) {
    console.error('语音识别失败:', err);
    isProcessing.value = false;
    errorMessage.value = err.message || '语音识别失败，请重试';
    emit('voiceError', err);
  }
  // #endif
};
</script>

<style lang="scss" scoped>
.voice-input-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32rpx;
}

.voice-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  box-shadow: 0 8rpx 24rpx rgba(76, 175, 80, 0.3);
  transition: all 0.3s ease;

  &.recording {
    background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
    box-shadow: 0 8rpx 24rpx rgba(244, 67, 54, 0.4);
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
}

.voice-icon {
  width: 80rpx;
  height: 80rpx;
  margin-bottom: 16rpx;
}

.icon-image {
  width: 100%;
  height: 100%;
}

.recording-animation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 100%;
}

.wave {
  width: 8rpx;
  height: 40rpx;
  background: white;
  border-radius: 4rpx;
  animation: wave 0.5s ease-in-out infinite alternate;
}

@keyframes wave {
  from {
    height: 20rpx;
  }
  to {
    height: 60rpx;
  }
}

.voice-text {
  font-size: 28rpx;
  color: white;
  font-weight: 500;
}

.recording-status {
  margin-top: 32rpx;
  text-align: center;

  .timer {
    font-size: 48rpx;
    font-weight: bold;
    color: #f44336;
  }

  .tip {
    font-size: 24rpx;
    color: #999;
    margin-top: 8rpx;
  }
}

.processing-status {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 32rpx;
  color: #666;
  font-size: 28rpx;
}

.loading-spinner {
  width: 32rpx;
  height: 32rpx;
  border: 4rpx solid #ddd;
  border-top-color: #4CAF50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-message {
  margin-top: 24rpx;
  padding: 16rpx 24rpx;
  background: #fff3f3;
  border-radius: 8rpx;
  color: #f44336;
  font-size: 26rpx;
}
</style>
