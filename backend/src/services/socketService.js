/**
 * Socket.io服务
 * 处理WebSocket实时推送
 */
const logger = require('../config/logger');

// 全局io实例引用
let ioInstance = null;

/**
 * 设置io实例
 * @param {Server} io - Socket.io服务器实例
 */
function setIoInstance(io) {
  ioInstance = io;
  logger.info('Socket.io实例已设置');
}

/**
 * 获取io实例
 * @returns {Server|null}
 */
function getIoInstance() {
  return ioInstance;
}

/**
 * 推送图片生成进度
 * @param {string} socketId - 客户端Socket ID
 * @param {number} recipeId - 菜谱ID
 * @param {string} status - 状态: pending, processing, completed, failed
 * @param {string} imageUrl - 图片URL（completed时提供）
 */
function emitImageProgress(socketId, recipeId, status, imageUrl = null) {
  if (!ioInstance) {
    logger.warn('Socket.io实例未初始化，无法推送');
    return;
  }

  const data = {
    recipeId,
    status,
    imageUrl,
    timestamp: Date.now()
  };

  // 如果有指定socketId，推送给特定客户端
  if (socketId) {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('image:progress', data);
      logger.debug(`推送图片进度到 ${socketId}: ${recipeId} - ${status}`);
    }
  }

  // 同时广播给房间（以recipeId为房间名）
  ioInstance.to(`recipe:${recipeId}`).emit('image:progress', data);
}

/**
 * 推送菜谱推荐完成
 * @param {string} socketId - 客户端Socket ID
 * @param {Array} recipes - 推荐的菜谱列表
 */
function emitRecommendationComplete(socketId, recipes) {
  if (!ioInstance) return;

  const socket = ioInstance.sockets.sockets.get(socketId);
  if (socket) {
    socket.emit('recommendation:complete', {
      recipes,
      timestamp: Date.now()
    });
  }
}

/**
 * 推送错误消息
 * @param {string} socketId - 客户端Socket ID
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 */
function emitError(socketId, message, code = 'ERROR') {
  if (!ioInstance) return;

  const socket = ioInstance.sockets.sockets.get(socketId);
  if (socket) {
    socket.emit('error', {
      message,
      code,
      timestamp: Date.now()
    });
  }
}

/**
 * 加入菜谱房间（用于接收该菜谱的更新）
 * @param {string} socketId - 客户端Socket ID
 * @param {number} recipeId - 菜谱ID
 */
function joinRecipeRoom(socketId, recipeId) {
  if (!ioInstance) return;

  const socket = ioInstance.sockets.sockets.get(socketId);
  if (socket) {
    socket.join(`recipe:${recipeId}`);
    logger.debug(`${socketId} 加入房间 recipe:${recipeId}`);
  }
}

/**
 * 离开菜谱房间
 * @param {string} socketId - 客户端Socket ID
 * @param {number} recipeId - 菜谱ID
 */
function leaveRecipeRoom(socketId, recipeId) {
  if (!ioInstance) return;

  const socket = ioInstance.sockets.sockets.get(socketId);
  if (socket) {
    socket.leave(`recipe:${recipeId}`);
    logger.debug(`${socketId} 离开房间 recipe:${recipeId}`);
  }
}

/**
 * 获取在线客户端数量
 * @returns {number}
 */
function getOnlineCount() {
  if (!ioInstance) return 0;
  return ioInstance.sockets.sockets.size;
}

/**
 * 初始化Socket.io事件处理
 * @param {Server} io - Socket.io服务器实例
 */
function initializeSocketHandlers(io) {
  setIoInstance(io);

  io.on('connection', (socket) => {
    logger.info(`客户端连接: ${socket.id}`);

    // 加入菜谱房间
    socket.on('join:recipe', (recipeId) => {
      joinRecipeRoom(socket.id, recipeId);
    });

    // 离开菜谱房间
    socket.on('leave:recipe', (recipeId) => {
      leaveRecipeRoom(socket.id, recipeId);
    });

    // 请求图片状态
    socket.on('image:status', async (recipeIds, callback) => {
      try {
        const { ImageLibrary } = require('../models');
        const statuses = {};

        for (const id of recipeIds) {
          const image = await ImageLibrary.findByPk(id);
          if (image) {
            statuses[id] = {
              ready: image.ossDownloaded,
              imageUrl: image.imageUrl
            };
          }
        }

        if (callback) callback({ success: true, data: statuses });
      } catch (error) {
        logger.error('获取图片状态失败:', error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // 断开连接
    socket.on('disconnect', () => {
      logger.info(`客户端断开: ${socket.id}`);
    });
  });
}

module.exports = {
  setIoInstance,
  getIoInstance,
  emitImageProgress,
  emitRecommendationComplete,
  emitError,
  joinRecipeRoom,
  leaveRecipeRoom,
  getOnlineCount,
  initializeSocketHandlers
};
