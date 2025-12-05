<template>
  <view class="voice-input-container">
    <!-- 录音按钮 -->
    <view
      class="voice-button"
      :class="{ recording: isRecording || isStarting }"
      @touchstart="startRecording"
      @touchend="stopRecording"
      @touchcancel="cancelRecording"
      @mousedown="startRecording"
      @mouseup="stopRecording"
      @mouseleave="handleMouseLeave"
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
      <!-- H5 音量指示器 -->
      <!-- #ifdef H5 -->
      <view class="volume-indicator">
        <view class="volume-bar" :style="{ width: volumeLevel + '%' }"></view>
      </view>
      <view class="volume-text">音量: {{ volumeLevel }}%</view>
      <!-- #endif -->
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

// H5 语音识别相关
const h5Recognition = ref(null);
const h5RecognitionResult = ref('');

// H5 音量检测相关
const volumeLevel = ref(0);
const audioContext = ref(null);
const analyser = ref(null);
const mediaStream = ref(null);
const volumeCheckInterval = ref(null);

// 格式化时间
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// H5 音量检测 - 启动
const startVolumeDetection = async () => {
  try {
    // 获取麦克风流
    mediaStream.value = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log('麦克风流获取成功:', mediaStream.value);

    // 列出所有音频轨道
    const audioTracks = mediaStream.value.getAudioTracks();
    console.log('音频轨道:', audioTracks.map(t => ({ label: t.label, id: t.id, enabled: t.enabled })));

    // 创建音频上下文
    audioContext.value = new (window.AudioContext || window.webkitAudioContext)();
    analyser.value = audioContext.value.createAnalyser();
    analyser.value.fftSize = 256;

    const source = audioContext.value.createMediaStreamSource(mediaStream.value);
    source.connect(analyser.value);

    // 开始检测音量
    const dataArray = new Uint8Array(analyser.value.frequencyBinCount);
    volumeCheckInterval.value = setInterval(() => {
      analyser.value.getByteFrequencyData(dataArray);
      // 计算平均音量
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      volumeLevel.value = Math.round((average / 255) * 100);
    }, 100);

    console.log('音量检测已启动');
  } catch (err) {
    console.error('启动音量检测失败:', err);
    errorMessage.value = '无法访问麦克风: ' + err.message;
  }
};

// H5 音量检测 - 停止
const stopVolumeDetection = () => {
  if (volumeCheckInterval.value) {
    clearInterval(volumeCheckInterval.value);
    volumeCheckInterval.value = null;
  }
  if (mediaStream.value) {
    mediaStream.value.getTracks().forEach(track => track.stop());
    mediaStream.value = null;
  }
  if (audioContext.value) {
    audioContext.value.close();
    audioContext.value = null;
  }
  volumeLevel.value = 0;
  console.log('音量检测已停止');
};

// 初始化 H5 语音识别
const initH5Recognition = () => {
  // 检查浏览器是否支持 Web Speech API
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('当前浏览器不支持 Web Speech API');
    return false;
  }

  h5Recognition.value = new SpeechRecognition();
  h5Recognition.value.continuous = true; // 持续识别
  h5Recognition.value.interimResults = true; // 返回临时结果
  h5Recognition.value.lang = 'zh-CN'; // 设置中文

  // 识别开始
  h5Recognition.value.onstart = () => {
    console.log('H5 语音识别开始');
    isStarting.value = false;
    isRecording.value = true;
    recordingTime.value = 0;
    h5RecognitionResult.value = '';
    errorMessage.value = '';
    emit('voiceStart');

    // 启动音量检测
    startVolumeDetection();

    // 开始计时
    timerInterval.value = setInterval(() => {
      recordingTime.value++;
      if (recordingTime.value >= props.maxDuration) {
        stopRecording();
      }
    }, 1000);
  };

  // 识别结果
  h5Recognition.value.onresult = (event) => {
    console.log('H5 onresult 事件:', event);

    // 重新构建完整的最终结果（不是累加，而是从所有 final 结果重新构建）
    let allFinalTranscript = '';
    let currentInterim = '';

    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      console.log(`结果 ${i}: "${transcript}", 置信度: ${confidence}, isFinal: ${result.isFinal}`);

      if (result.isFinal) {
        allFinalTranscript += transcript;
      } else {
        currentInterim += transcript;
      }
    }

    // 只保存最终结果，临时结果仅用于显示
    if (allFinalTranscript) {
      h5RecognitionResult.value = allFinalTranscript;
    }
    // 如果没有最终结果但有临时结果，暂存临时结果
    else if (currentInterim && !h5RecognitionResult.value) {
      h5RecognitionResult.value = currentInterim;
    }

    console.log('H5 识别结果:', { allFinal: allFinalTranscript, interim: currentInterim, saved: h5RecognitionResult.value });
  };

  // 识别结束
  h5Recognition.value.onend = () => {
    console.log('H5 语音识别结束, 最终结果:', h5RecognitionResult.value);

    // 防止重复触发
    if (!isRecording.value && !isStarting.value) {
      console.log('已处理过，跳过重复的 onend');
      return;
    }

    clearInterval(timerInterval.value);
    stopVolumeDetection();
    isRecording.value = false;
    isStarting.value = false;
    emit('voiceEnd');

    if (recordingTime.value < props.minDuration) {
      errorMessage.value = '录音时间太短，请重试';
      return;
    }

    // 返回识别结果（只发送一次）
    const result = h5RecognitionResult.value.trim();
    h5RecognitionResult.value = ''; // 清空，防止重复发送

    if (result) {
      emit('voiceResult', result);
    } else {
      errorMessage.value = '未识别到内容，请重试';
    }
  };

  // 识别错误
  h5Recognition.value.onerror = (event) => {
    console.error('H5 语音识别错误:', event.error);
    clearInterval(timerInterval.value);
    stopVolumeDetection();
    isStarting.value = false;
    isRecording.value = false;

    let errMsg = '语音识别失败';
    switch (event.error) {
      case 'not-allowed':
        errMsg = '请授权麦克风权限';
        break;
      case 'no-speech':
        errMsg = '未检测到语音，请重试';
        break;
      case 'network':
        errMsg = '网络错误，请检查网络连接';
        break;
      case 'aborted':
        errMsg = '识别已取消';
        break;
    }
    errorMessage.value = errMsg;
    emit('voiceError', { error: event.error, message: errMsg });
  };

  return true;
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

  // #ifdef H5
  initH5Recognition();
  // #endif
});

// 清理
onUnmounted(() => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
  }
  // #ifdef H5
  if (h5Recognition.value) {
    try {
      h5Recognition.value.abort();
    } catch (err) {
      // 忽略清理时的错误
    }
    h5Recognition.value = null;
  }
  // #endif
});

// 开始录音
const startRecording = (e) => {
  console.log('startRecording 被调用');

  // 防止重复触发（mousedown 和 touchstart 可能同时触发）
  if (isRecording.value || isStarting.value) {
    console.log('已在录音或启动中，跳过');
    return;
  }

  // #ifdef MP-WEIXIN
  if (e.touches && e.touches[0]) {
    startY.value = e.touches[0].clientY;
  }
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

  // #ifdef H5
  if (!h5Recognition.value) {
    // 尝试重新初始化
    if (!initH5Recognition()) {
      errorMessage.value = '当前浏览器不支持语音识别，请使用Chrome浏览器';
      return;
    }
  }

  isStarting.value = true;
  h5RecognitionResult.value = '';
  errorMessage.value = '';

  try {
    h5Recognition.value.start();
    console.log('H5 语音识别已启动');
  } catch (err) {
    console.error('启动 H5 语音识别失败:', err);
    isStarting.value = false;
    if (err.message && err.message.includes('already started')) {
      // 如果已经在运行，先停止再重启
      h5Recognition.value.stop();
    } else {
      errorMessage.value = '启动语音识别失败，请重试';
    }
  }
  // #endif
};

// 停止录音
const stopRecording = (e) => {
  console.log('stopRecording 被调用, isStarting:', isStarting.value, 'isRecording:', isRecording.value);

  // 如果正在启动但还没真正开始，重置状态
  if (isStarting.value && !isRecording.value) {
    console.log('录音还没开始，重置 isStarting');
    isStarting.value = false;
    // #ifdef H5
    if (h5Recognition.value) {
      try {
        h5Recognition.value.stop();
      } catch (err) {
        console.log('停止 H5 识别时出错:', err);
      }
    }
    // #endif
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

  // #ifdef H5
  if (h5Recognition.value) {
    console.log('调用 h5Recognition.stop()');
    try {
      h5Recognition.value.stop();
    } catch (err) {
      console.error('停止 H5 语音识别失败:', err);
    }
  }
  // #endif
};

// 处理鼠标离开（H5专用）
const handleMouseLeave = () => {
  // #ifdef H5
  if (isRecording.value || isStarting.value) {
    console.log('鼠标离开，取消录音');
    cancelRecording();
  }
  // #endif
};

// 取消录音
const cancelRecording = () => {
  if (!isRecording.value && !isStarting.value) return;

  // #ifdef MP-WEIXIN
  if (recorderManager.value) {
    recorderManager.value.stop();
  }
  // #endif

  // #ifdef H5
  if (h5Recognition.value) {
    try {
      h5Recognition.value.abort(); // 使用 abort 来取消，不触发 onend
    } catch (err) {
      console.log('取消 H5 识别时出错:', err);
    }
  }
  h5RecognitionResult.value = '';
  // #endif

  clearInterval(timerInterval.value);
  isStarting.value = false;
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

  .volume-indicator {
    width: 200rpx;
    height: 16rpx;
    background: #eee;
    border-radius: 8rpx;
    margin: 16rpx auto;
    overflow: hidden;
  }

  .volume-bar {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50, #8BC34A, #FFEB3B, #FF9800, #f44336);
    border-radius: 8rpx;
    transition: width 0.1s ease;
  }

  .volume-text {
    font-size: 24rpx;
    color: #666;
    margin-bottom: 8rpx;
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
