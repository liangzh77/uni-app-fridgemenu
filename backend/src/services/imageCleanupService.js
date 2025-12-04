/**
 * 图片清理服务
 * 自动清理过期和低使用率的图片，控制存储容量
 */
const { ImageLibrary } = require('../models');
const { deleteFromCDN } = require('./storageService');
const logger = require('../config/logger');
const { Op } = require('sequelize');

// 配置常量
const CONFIG = {
  MAX_STORAGE_GB: 10,                    // 最大存储容量 (GB)
  MAX_STORAGE_KB: 10 * 1024 * 1024,      // 最大存储容量 (KB)
  INACTIVE_MONTHS: 3,                     // 不活跃月数
  MIN_USAGE_COUNT: 10,                    // 最低使用次数阈值
  BATCH_SIZE: 100,                        // 每批删除数量
  WARNING_THRESHOLD: 0.8                  // 容量预警阈值 (80%)
};

/**
 * 获取图片库统计信息
 * @returns {Promise<Object>} 统计数据
 */
async function getStorageStats() {
  try {
    const stats = await ImageLibrary.findOne({
      attributes: [
        [ImageLibrary.sequelize.fn('COUNT', ImageLibrary.sequelize.col('id')), 'totalImages'],
        [ImageLibrary.sequelize.fn('SUM', ImageLibrary.sequelize.col('image_size_kb')), 'totalSizeKb'],
        [ImageLibrary.sequelize.fn('AVG', ImageLibrary.sequelize.col('image_size_kb')), 'avgSizeKb'],
        [ImageLibrary.sequelize.fn('MAX', ImageLibrary.sequelize.col('created_at')), 'lastCreated'],
        [ImageLibrary.sequelize.fn('SUM', ImageLibrary.sequelize.col('usage_count')), 'totalUsage']
      ],
      raw: true
    });

    const totalSizeKb = parseInt(stats.totalSizeKb) || 0;
    const totalSizeGb = totalSizeKb / (1024 * 1024);
    const usageRate = totalSizeKb / CONFIG.MAX_STORAGE_KB;

    return {
      totalImages: parseInt(stats.totalImages) || 0,
      totalSizeKb,
      totalSizeGb: parseFloat(totalSizeGb.toFixed(2)),
      totalSizeMb: parseFloat((totalSizeKb / 1024).toFixed(2)),
      avgSizeKb: parseFloat(stats.avgSizeKb) || 0,
      usageRate: parseFloat((usageRate * 100).toFixed(2)),
      maxStorageGb: CONFIG.MAX_STORAGE_GB,
      lastCreated: stats.lastCreated,
      totalUsage: parseInt(stats.totalUsage) || 0,
      isWarning: usageRate >= CONFIG.WARNING_THRESHOLD,
      isOverCapacity: usageRate >= 1
    };
  } catch (error) {
    logger.error('获取存储统计失败:', error);
    throw error;
  }
}

/**
 * 查找需要清理的图片
 * 条件: 3个月未使用 且 使用次数 < 10
 * @param {number} limit 查询数量限制
 * @returns {Promise<Array>} 待清理图片列表
 */
async function findCleanupCandidates(limit = CONFIG.BATCH_SIZE) {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - CONFIG.INACTIVE_MONTHS);

  try {
    const candidates = await ImageLibrary.findAll({
      where: {
        lastUsedAt: {
          [Op.lt]: threeMonthsAgo
        },
        usageCount: {
          [Op.lt]: CONFIG.MIN_USAGE_COUNT
        }
      },
      order: [
        ['lastUsedAt', 'ASC'],      // 最久未使用的优先
        ['usageCount', 'ASC']        // 使用次数最少的优先
      ],
      limit
    });

    return candidates;
  } catch (error) {
    logger.error('查找清理候选图片失败:', error);
    throw error;
  }
}

/**
 * 删除单张图片
 * @param {Object} image ImageLibrary实例
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteImage(image) {
  try {
    // 1. 从CDN删除文件
    if (image.imageUrl) {
      await deleteFromCDN(image.imageUrl);
    }

    // 2. 删除数据库记录
    await image.destroy();

    logger.info(`已删除图片: ${image.id} (${image.normalizedDishName}), 大小: ${image.imageSizeKb}KB`);
    return true;
  } catch (error) {
    logger.error(`删除图片失败 ${image.id}:`, error);
    return false;
  }
}

/**
 * 执行图片清理
 * @param {Object} options 清理选项
 * @param {boolean} options.dryRun 试运行模式，不实际删除
 * @param {number} options.targetSizeGb 目标容量 (GB)
 * @returns {Promise<Object>} 清理结果
 */
async function executeCleanup(options = {}) {
  const { dryRun = false, targetSizeGb = CONFIG.MAX_STORAGE_GB * 0.9 } = options;
  const targetSizeKb = targetSizeGb * 1024 * 1024;

  const startTime = Date.now();
  const result = {
    startTime: new Date().toISOString(),
    dryRun,
    deletedCount: 0,
    freedSpaceKb: 0,
    freedSpaceMb: 0,
    errors: [],
    beforeStats: null,
    afterStats: null
  };

  try {
    // 获取清理前统计
    result.beforeStats = await getStorageStats();

    // 检查是否需要清理
    if (result.beforeStats.totalSizeKb <= targetSizeKb) {
      logger.info(`当前容量 ${result.beforeStats.totalSizeMb}MB，未超过目标 ${targetSizeGb}GB，无需清理`);
      result.message = '容量未超标，无需清理';
      return result;
    }

    logger.info(`开始图片清理，当前容量: ${result.beforeStats.totalSizeMb}MB，目标: ${targetSizeGb}GB`);

    // 计算需要释放的空间
    const needToFreeKb = result.beforeStats.totalSizeKb - targetSizeKb;
    let freedKb = 0;

    // 分批查找并删除
    while (freedKb < needToFreeKb) {
      const candidates = await findCleanupCandidates(CONFIG.BATCH_SIZE);

      if (candidates.length === 0) {
        logger.warn('没有更多符合清理条件的图片');
        break;
      }

      for (const image of candidates) {
        if (freedKb >= needToFreeKb) break;

        if (dryRun) {
          // 试运行模式，只记录不删除
          logger.info(`[DRY RUN] 将删除: ${image.id} (${image.normalizedDishName}), ${image.imageSizeKb}KB`);
          freedKb += image.imageSizeKb;
          result.deletedCount++;
        } else {
          const success = await deleteImage(image);
          if (success) {
            freedKb += image.imageSizeKb;
            result.deletedCount++;
          } else {
            result.errors.push(`删除失败: ${image.id}`);
          }
        }
      }
    }

    result.freedSpaceKb = freedKb;
    result.freedSpaceMb = parseFloat((freedKb / 1024).toFixed(2));

    // 获取清理后统计
    if (!dryRun) {
      result.afterStats = await getStorageStats();
    }

    result.duration = Date.now() - startTime;
    result.message = `清理完成，删除 ${result.deletedCount} 张图片，释放 ${result.freedSpaceMb}MB`;

    logger.info(result.message);
    return result;

  } catch (error) {
    logger.error('执行清理失败:', error);
    result.error = error.message;
    throw error;
  }
}

/**
 * 强制清理指定数量的最旧图片
 * 用于紧急释放空间
 * @param {number} count 删除数量
 * @returns {Promise<Object>} 清理结果
 */
async function forceCleanup(count = 100) {
  const result = {
    deletedCount: 0,
    freedSpaceKb: 0,
    errors: []
  };

  try {
    // 按创建时间升序查找最旧的图片
    const oldestImages = await ImageLibrary.findAll({
      order: [['createdAt', 'ASC']],
      limit: count
    });

    for (const image of oldestImages) {
      const success = await deleteImage(image);
      if (success) {
        result.deletedCount++;
        result.freedSpaceKb += image.imageSizeKb;
      } else {
        result.errors.push(`删除失败: ${image.id}`);
      }
    }

    result.freedSpaceMb = parseFloat((result.freedSpaceKb / 1024).toFixed(2));
    logger.info(`强制清理完成，删除 ${result.deletedCount} 张图片，释放 ${result.freedSpaceMb}MB`);

    return result;
  } catch (error) {
    logger.error('强制清理失败:', error);
    throw error;
  }
}

/**
 * 清理指定菜名的所有图片
 * @param {string} normalizedDishName 规范化菜名
 * @returns {Promise<number>} 删除数量
 */
async function cleanupByDishName(normalizedDishName) {
  try {
    const images = await ImageLibrary.findAll({
      where: { normalizedDishName }
    });

    let deletedCount = 0;
    for (const image of images) {
      const success = await deleteImage(image);
      if (success) deletedCount++;
    }

    logger.info(`清理菜名 "${normalizedDishName}" 的图片，删除 ${deletedCount} 张`);
    return deletedCount;
  } catch (error) {
    logger.error(`清理菜名图片失败 ${normalizedDishName}:`, error);
    throw error;
  }
}

/**
 * 获取清理预览
 * 显示将被清理的图片列表，不实际删除
 * @param {number} limit 预览数量
 * @returns {Promise<Object>} 预览结果
 */
async function getCleanupPreview(limit = 50) {
  try {
    const candidates = await findCleanupCandidates(limit);
    const totalSizeKb = candidates.reduce((sum, img) => sum + img.imageSizeKb, 0);

    return {
      count: candidates.length,
      totalSizeKb,
      totalSizeMb: parseFloat((totalSizeKb / 1024).toFixed(2)),
      images: candidates.map(img => ({
        id: img.id,
        dishName: img.normalizedDishName,
        sizeKb: img.imageSizeKb,
        usageCount: img.usageCount,
        lastUsedAt: img.lastUsedAt,
        createdAt: img.createdAt
      }))
    };
  } catch (error) {
    logger.error('获取清理预览失败:', error);
    throw error;
  }
}

module.exports = {
  getStorageStats,
  findCleanupCandidates,
  executeCleanup,
  forceCleanup,
  cleanupByDishName,
  getCleanupPreview,
  CONFIG
};
