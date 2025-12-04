/**
 * 应用入口文件
 * Express服务器配置和启动
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');

const errorHandler = require('./api/middleware/errorHandler');
const logger = require('./config/logger');
const apiRoutes = require('./api/routes');
const { testConnection } = require('./models');
const { initializeSocketHandlers } = require('./services/socketService');
const { startScheduler } = require('./jobs/imageDownloadJob');
const { startCleanupScheduler, stopCleanupScheduler } = require('./jobs/imageCleanupJob');
const { closeQueues } = require('./jobs/queue');

// 创建Express应用
const app = express();
const httpServer = createServer(app);

// Socket.io配置
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 中间件配置
app.use(helmet()); // 安全头
app.use(cors()); // 跨域支持
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } })); // 请求日志
app.use(express.json({ limit: '10mb' })); // JSON解析
app.use(express.urlencoded({ extended: true })); // URL编码解析

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API路由
app.use('/api', apiRoutes);

// 404处理
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `路径 ${req.path} 不存在`
  });
});

// 错误处理中间件
app.use(errorHandler);

// 初始化Socket.io事件处理
initializeSocketHandlers(io);

// 将io实例挂载到app上，供其他模块使用
app.set('io', io);

// 启动服务器
const PORT = process.env.PORT || 3000;

async function startServer() {
  // 测试数据库连接
  const dbConnected = await testConnection();
  if (dbConnected) {
    logger.info('数据库连接成功');
  } else {
    logger.warn('数据库连接失败，部分功能可能不可用');
  }

  // 启动定时任务调度器
  startScheduler();

  // 启动图片清理调度器 (每天凌晨2点)
  startCleanupScheduler('0 2 * * *');

  httpServer.listen(PORT, () => {
    logger.info(`服务器启动成功，端口: ${PORT}`);
    logger.info(`环境: ${process.env.NODE_ENV || 'development'}`);
    logger.info('WebSocket服务已就绪');
    logger.info('定时任务调度器已启动');
  });
}

startServer();

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM信号，开始优雅关闭...');

  // 停止清理调度器
  stopCleanupScheduler();

  // 关闭任务队列
  await closeQueues();

  httpServer.close(() => {
    logger.info('HTTP服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('收到SIGINT信号，开始优雅关闭...');
  stopCleanupScheduler();
  await closeQueues();
  httpServer.close(() => {
    logger.info('HTTP服务器已关闭');
    process.exit(0);
  });
});

module.exports = { app, io };
