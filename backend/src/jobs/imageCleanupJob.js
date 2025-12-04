/**
 * 图片清理定时任务
 * 每天凌晨2点自动执行图片清理
 */
const cron = require('node-cron');
const logger = require('../config/logger');
const {
  getStorageStats,
  executeCleanup,
  getCleanupPreview,
  CONFIG
} = require('../services/imageCleanupService');

// 清理任务状态
let isRunning = false;
let lastRunResult = null;
let scheduledTask = null;

/**
 * 执行清理任务
 * @returns {Promise<Object>} 清理结果
 */
async function runCleanupTask() {
  if (isRunning) {
    logger.warn('图片清理任务正在运行中，跳过本次执行');
    return { skipped: true, reason: '任务运行中' };
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    logger.info('========== 开始执行图片清理任务 ==========');

    // 1. 获取当前存储状态
    const stats = await getStorageStats();
    logger.info(`当前存储状态: ${stats.totalImages}张图片, ${stats.totalSizeMb}MB (${stats.usageRate}%)`);

    // 2. 检查是否需要清理
    if (!stats.isWarning) {
      logger.info(`容量使用率 ${stats.usageRate}% < ${CONFIG.WARNING_THRESHOLD * 100}%，无需清理`);
      lastRunResult = {
        timestamp: new Date().toISOString(),
        action: 'skipped',
        reason: '容量未达到预警阈值',
        stats
      };
      return lastRunResult;
    }

    // 3. 获取清理预览
    const preview = await getCleanupPreview(100);
    logger.info(`预计清理: ${preview.count}张图片, 释放${preview.totalSizeMb}MB`);

    // 4. 执行清理
    const result = await executeCleanup({
      dryRun: false,
      targetSizeGb: CONFIG.MAX_STORAGE_GB * 0.85  // 清理到85%容量
    });

    // 5. 记录结果
    lastRunResult = {
      timestamp: new Date().toISOString(),
      action: 'cleaned',
      duration: Date.now() - startTime,
      ...result
    };

    logger.info('========== 图片清理任务完成 ==========');
    logger.info(`删除: ${result.deletedCount}张, 释放: ${result.freedSpaceMb}MB, 耗时: ${lastRunResult.duration}ms`);

    return lastRunResult;

  } catch (error) {
    logger.error('图片清理任务执行失败:', error);
    lastRunResult = {
      timestamp: new Date().toISOString(),
      action: 'error',
      error: error.message
    };
    throw error;

  } finally {
    isRunning = false;
  }
}

/**
 * 启动定时清理任务
 * 默认每天凌晨2点执行
 * @param {string} cronExpression cron表达式，默认 '0 2 * * *'
 */
function startCleanupScheduler(cronExpression = '0 2 * * *') {
  if (scheduledTask) {
    logger.warn('清理任务调度器已在运行');
    return;
  }

  // 验证cron表达式
  if (!cron.validate(cronExpression)) {
    throw new Error(`无效的cron表达式: ${cronExpression}`);
  }

  scheduledTask = cron.schedule(cronExpression, async () => {
    try {
      await runCleanupTask();
    } catch (error) {
      logger.error('定时清理任务执行异常:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai'
  });

  logger.info(`图片清理调度器已启动，执行计划: ${cronExpression} (Asia/Shanghai)`);
}

/**
 * 停止定时清理任务
 */
function stopCleanupScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('图片清理调度器已停止');
  }
}

/**
 * 手动触发清理任务
 * @param {Object} options 清理选项
 * @returns {Promise<Object>} 清理结果
 */
async function triggerManualCleanup(options = {}) {
  logger.info('手动触发图片清理任务');
  return runCleanupTask();
}

/**
 * 获取任务状态
 * @returns {Object} 任务状态
 */
function getTaskStatus() {
  return {
    isRunning,
    isScheduled: scheduledTask !== null,
    lastRunResult,
    config: {
      maxStorageGb: CONFIG.MAX_STORAGE_GB,
      inactiveMonths: CONFIG.INACTIVE_MONTHS,
      minUsageCount: CONFIG.MIN_USAGE_COUNT,
      warningThreshold: CONFIG.WARNING_THRESHOLD
    }
  };
}

/**
 * 获取下次执行时间
 * @returns {Date|null} 下次执行时间
 */
function getNextRunTime() {
  // node-cron不直接提供下次执行时间，这里简单计算
  const now = new Date();
  const next = new Date(now);

  // 设置为凌晨2点
  next.setHours(2, 0, 0, 0);

  // 如果已过今天2点，则为明天
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

module.exports = {
  runCleanupTask,
  startCleanupScheduler,
  stopCleanupScheduler,
  triggerManualCleanup,
  getTaskStatus,
  getNextRunTime
};
