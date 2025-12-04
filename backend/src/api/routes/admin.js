/**
 * 管理员API路由
 * 提供系统监控、图片库管理等功能
 */
const express = require('express');
const router = express.Router();
const logger = require('../../config/logger');
const {
  getStorageStats,
  getCleanupPreview,
  executeCleanup,
  forceCleanup
} = require('../../services/imageCleanupService');
const {
  triggerManualCleanup,
  getTaskStatus,
  getNextRunTime
} = require('../../jobs/imageCleanupJob');

/**
 * GET /api/admin/image-library/stats
 * 获取图片库统计信息
 */
router.get('/image-library/stats', async (req, res, next) => {
  try {
    const stats = await getStorageStats();

    res.json({
      success: true,
      data: {
        ...stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/image-library/cleanup-preview
 * 获取清理预览（不实际删除）
 */
router.get('/image-library/cleanup-preview', async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const preview = await getCleanupPreview(parseInt(limit));

    res.json({
      success: true,
      data: preview
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/image-library/cleanup
 * 手动触发清理任务
 */
router.post('/image-library/cleanup', async (req, res, next) => {
  try {
    const { dryRun = false, targetSizeGb } = req.body;

    logger.info(`管理员触发图片清理, dryRun: ${dryRun}`);

    const result = await executeCleanup({
      dryRun,
      targetSizeGb: targetSizeGb || undefined
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/image-library/force-cleanup
 * 强制清理指定数量的最旧图片
 */
router.post('/image-library/force-cleanup', async (req, res, next) => {
  try {
    const { count = 100 } = req.body;

    if (count > 1000) {
      return res.status(400).json({
        success: false,
        message: '单次强制清理数量不能超过1000'
      });
    }

    logger.warn(`管理员触发强制清理, 数量: ${count}`);

    const result = await forceCleanup(parseInt(count));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/cleanup-task/status
 * 获取清理任务状态
 */
router.get('/cleanup-task/status', async (req, res, next) => {
  try {
    const status = getTaskStatus();
    const nextRun = getNextRunTime();

    res.json({
      success: true,
      data: {
        ...status,
        nextRunTime: nextRun?.toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/cleanup-task/trigger
 * 手动触发定时清理任务
 */
router.post('/cleanup-task/trigger', async (req, res, next) => {
  try {
    logger.info('管理员手动触发清理定时任务');

    const result = await triggerManualCleanup();

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/health
 * 系统健康检查
 */
router.get('/health', async (req, res, next) => {
  try {
    const storageStats = await getStorageStats();
    const taskStatus = getTaskStatus();

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        storage: {
          usageRate: storageStats.usageRate,
          isWarning: storageStats.isWarning,
          isOverCapacity: storageStats.isOverCapacity
        },
        cleanupTask: {
          isRunning: taskStatus.isRunning,
          isScheduled: taskStatus.isScheduled
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/dashboard
 * 管理仪表盘数据
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const [storageStats, taskStatus, cleanupPreview] = await Promise.all([
      getStorageStats(),
      getTaskStatus(),
      getCleanupPreview(10)
    ]);

    res.json({
      success: true,
      data: {
        storage: storageStats,
        cleanupTask: {
          ...taskStatus,
          nextRunTime: getNextRunTime()?.toISOString()
        },
        cleanupPreview: {
          candidateCount: cleanupPreview.count,
          potentialFreeMb: cleanupPreview.totalSizeMb
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
