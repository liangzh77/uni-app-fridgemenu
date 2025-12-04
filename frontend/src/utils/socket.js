/**
 * WebSocket工具类
 * 封装Socket.io连接管理
 */

// Socket.io客户端实例
let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// 事件监听器
const listeners = new Map();

/**
 * 获取WebSocket服务器URL
 */
function getSocketUrl() {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  return baseUrl.replace(/^http/, 'ws');
}

/**
 * 连接WebSocket
 * @returns {Promise<boolean>}
 */
export function connectSocket() {
  return new Promise((resolve, reject) => {
    // #ifdef H5
    // H5环境使用socket.io-client
    import('socket.io-client').then(({ io }) => {
      const url = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

      socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: 1000
      });

      socket.on('connect', () => {
        console.log('WebSocket已连接:', socket.id);
        reconnectAttempts = 0;
        resolve(true);
      });

      socket.on('connect_error', (error) => {
        console.error('WebSocket连接错误:', error);
        reconnectAttempts++;
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          reject(new Error('WebSocket连接失败'));
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('WebSocket断开:', reason);
      });

      // 注册已有的监听器
      listeners.forEach((callback, event) => {
        socket.on(event, callback);
      });
    }).catch(reject);
    // #endif

    // #ifdef MP-WEIXIN
    // 微信小程序使用uni.connectSocket
    const url = getSocketUrl();

    uni.connectSocket({
      url,
      success: () => {
        console.log('WebSocket连接中...');
      },
      fail: (err) => {
        console.error('WebSocket连接失败:', err);
        reject(err);
      }
    });

    uni.onSocketOpen(() => {
      console.log('WebSocket已连接');
      reconnectAttempts = 0;
      resolve(true);
    });

    uni.onSocketError((err) => {
      console.error('WebSocket错误:', err);
      reconnectAttempts++;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        reject(new Error('WebSocket连接失败'));
      }
    });

    uni.onSocketMessage((res) => {
      try {
        const data = JSON.parse(res.data);
        const event = data.event;
        const payload = data.data;

        if (listeners.has(event)) {
          listeners.get(event)(payload);
        }
      } catch (e) {
        console.error('解析消息失败:', e);
      }
    });

    uni.onSocketClose(() => {
      console.log('WebSocket已关闭');
    });
    // #endif
  });
}

/**
 * 断开WebSocket连接
 */
export function disconnectSocket() {
  // #ifdef H5
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  // #endif

  // #ifdef MP-WEIXIN
  uni.closeSocket();
  // #endif

  listeners.clear();
}

/**
 * 发送消息
 * @param {string} event - 事件名
 * @param {any} data - 数据
 */
export function emit(event, data) {
  // #ifdef H5
  if (socket && socket.connected) {
    socket.emit(event, data);
  }
  // #endif

  // #ifdef MP-WEIXIN
  uni.sendSocketMessage({
    data: JSON.stringify({ event, data })
  });
  // #endif
}

/**
 * 监听事件
 * @param {string} event - 事件名
 * @param {Function} callback - 回调函数
 */
export function on(event, callback) {
  listeners.set(event, callback);

  // #ifdef H5
  if (socket) {
    socket.on(event, callback);
  }
  // #endif
}

/**
 * 取消监听事件
 * @param {string} event - 事件名
 */
export function off(event) {
  listeners.delete(event);

  // #ifdef H5
  if (socket) {
    socket.off(event);
  }
  // #endif
}

/**
 * 监听图片生成进度
 * @param {Function} callback - 回调函数 ({ recipeId, status, imageUrl })
 */
export function onImageProgress(callback) {
  on('image:progress', callback);
}

/**
 * 取消监听图片生成进度
 */
export function offImageProgress() {
  off('image:progress');
}

/**
 * 加入菜谱房间
 * @param {number} recipeId - 菜谱ID
 */
export function joinRecipeRoom(recipeId) {
  emit('join:recipe', recipeId);
}

/**
 * 离开菜谱房间
 * @param {number} recipeId - 菜谱ID
 */
export function leaveRecipeRoom(recipeId) {
  emit('leave:recipe', recipeId);
}

/**
 * 获取连接状态
 * @returns {boolean}
 */
export function isConnected() {
  // #ifdef H5
  return socket?.connected || false;
  // #endif

  // #ifdef MP-WEIXIN
  // 微信小程序没有直接的方法检查连接状态
  return true;
  // #endif
}

/**
 * 获取Socket ID
 * @returns {string|null}
 */
export function getSocketId() {
  // #ifdef H5
  return socket?.id || null;
  // #endif

  // #ifdef MP-WEIXIN
  return null;
  // #endif
}

export default {
  connectSocket,
  disconnectSocket,
  emit,
  on,
  off,
  onImageProgress,
  offImageProgress,
  joinRecipeRoom,
  leaveRecipeRoom,
  isConnected,
  getSocketId
};
