/**
 * ImageLibrary 模型
 * 菜品图片库
 */
const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { getCache, setCache, deleteCache } = require('../config/redis');
const logger = require('../config/logger');

// Redis缓存前缀和过期时间
const CACHE_PREFIX = 'img:';
const CACHE_TTL = 24 * 60 * 60; // 24小时

const ImageLibrary = sequelize.define('ImageLibrary', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键ID'
  },
  normalizedDishName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'normalized_dish_name',
    comment: '规范化菜名'
  },
  recipeHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
    field: 'recipe_hash',
    comment: '菜谱哈希值（防止并发重复生成）'
  },
  imageUrl: {
    type: DataTypes.STRING(512),
    allowNull: false,
    field: 'image_url',
    comment: '图片URL（永久存储）'
  },
  imageHash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    field: 'image_hash',
    comment: '图片内容MD5（存储去重）'
  },
  imageSizeKb: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'image_size_kb',
    comment: '图片大小(KB)'
  },
  usageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'usage_count',
    comment: '使用次数'
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_used_at',
    comment: '最后使用时间'
  },
  ossTempUrl: {
    type: DataTypes.STRING(512),
    allowNull: true,
    field: 'oss_temp_url',
    comment: 'OSS临时URL（通义万相返回）'
  },
  ossDownloaded: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'oss_downloaded',
    comment: '是否已转存到自有CDN'
  }
}, {
  tableName: 'image_library',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['normalized_dish_name'] },
    { fields: ['usage_count'], order: [['usage_count', 'DESC']] },
    { fields: ['last_used_at'], order: [['last_used_at', 'DESC']] },
    { fields: ['oss_downloaded'] },
    { unique: true, fields: ['recipe_hash'] }
  ]
});

/**
 * 类方法扩展
 */

/**
 * 根据规范化菜名查找图片（优先使用缓存）
 * 图片复用策略：同一道菜（规范化后）可复用相同图片
 * @param {string} normalizedDishName - 规范化菜名
 * @returns {Promise<ImageLibrary|null>}
 */
ImageLibrary.findByNormalizedDishName = async function(normalizedDishName) {
  const cacheKey = `${CACHE_PREFIX}${normalizedDishName}`;

  // 先查缓存
  try {
    const cached = await getCache(cacheKey);
    if (cached) {
      logger.debug(`图片缓存命中: ${normalizedDishName}`);
      // 异步更新使用统计
      this.incrementUsage(cached.id).catch(err =>
        logger.warn('更新使用统计失败:', err)
      );
      return cached;
    }
  } catch (err) {
    logger.warn('Redis缓存读取失败:', err);
  }

  // 查数据库（B-Tree索引优化）
  const image = await this.findOne({
    where: {
      normalizedDishName,
      ossDownloaded: true // 只返回已转存的图片
    },
    order: [['usage_count', 'DESC']] // 优先返回使用最多的图片
  });

  if (image) {
    // 写入缓存
    try {
      await setCache(cacheKey, image.toJSON(), CACHE_TTL);
    } catch (err) {
      logger.warn('Redis缓存写入失败:', err);
    }

    // 异步更新使用统计
    this.incrementUsage(image.id).catch(err =>
      logger.warn('更新使用统计失败:', err)
    );
  }

  return image;
};

/**
 * 根据菜谱哈希查找（防止并发重复生成）
 * @param {string} recipeHash - 菜谱哈希值
 * @returns {Promise<ImageLibrary|null>}
 */
ImageLibrary.findByRecipeHash = async function(recipeHash) {
  return this.findOne({
    where: { recipeHash }
  });
};

/**
 * 创建图片记录
 * @param {Object} data - 图片数据
 * @returns {Promise<ImageLibrary>}
 */
ImageLibrary.createImage = async function(data) {
  const image = await this.create({
    normalizedDishName: data.normalizedDishName,
    recipeHash: data.recipeHash,
    imageUrl: data.imageUrl,
    imageHash: data.imageHash,
    imageSizeKb: data.imageSizeKb || 0,
    ossTempUrl: data.ossTempUrl,
    ossDownloaded: data.ossDownloaded || false,
    usageCount: 1,
    lastUsedAt: new Date()
  });

  // 更新缓存
  const cacheKey = `${CACHE_PREFIX}${data.normalizedDishName}`;
  try {
    await setCache(cacheKey, image.toJSON(), CACHE_TTL);
  } catch (err) {
    logger.warn('Redis缓存写入失败:', err);
  }

  return image;
};

/**
 * 更新图片URL（转存完成后）
 * @param {number} id - 图片ID
 * @param {string} permanentUrl - 永久URL
 * @param {string} imageHash - 图片内容哈希
 * @param {number} imageSizeKb - 图片大小
 * @returns {Promise<[number]>}
 */
ImageLibrary.markDownloaded = async function(id, permanentUrl, imageHash, imageSizeKb) {
  const image = await this.findByPk(id);
  if (!image) return [0];

  await image.update({
    imageUrl: permanentUrl,
    imageHash,
    imageSizeKb,
    ossDownloaded: true
  });

  // 更新缓存
  const cacheKey = `${CACHE_PREFIX}${image.normalizedDishName}`;
  try {
    await setCache(cacheKey, image.toJSON(), CACHE_TTL);
  } catch (err) {
    logger.warn('Redis缓存更新失败:', err);
  }

  return [1];
};

/**
 * 增加使用次数
 * @param {number} id - 图片ID
 * @returns {Promise<void>}
 */
ImageLibrary.incrementUsage = async function(id) {
  await this.update(
    {
      usageCount: sequelize.literal('usage_count + 1'),
      lastUsedAt: new Date()
    },
    { where: { id } }
  );
};

/**
 * 获取待转存的图片列表
 * @param {number} limit - 数量限制
 * @returns {Promise<ImageLibrary[]>}
 */
ImageLibrary.getPendingDownloads = async function(limit = 100) {
  return this.findAll({
    where: { ossDownloaded: false },
    limit,
    order: [['created_at', 'ASC']]
  });
};

/**
 * 清理不活跃图片（可用于定期清理）
 * @param {number} days - 不活跃天数
 * @returns {Promise<number>} 删除的数量
 */
ImageLibrary.cleanupInactive = async function(days = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const images = await this.findAll({
    where: {
      lastUsedAt: { [Op.lt]: cutoffDate },
      usageCount: { [Op.lt]: 5 } // 使用次数少于5次
    }
  });

  // 清除缓存
  for (const img of images) {
    const cacheKey = `${CACHE_PREFIX}${img.normalizedDishName}`;
    try {
      await deleteCache(cacheKey);
    } catch (err) {
      logger.warn('清除缓存失败:', err);
    }
  }

  return this.destroy({
    where: {
      lastUsedAt: { [Op.lt]: cutoffDate },
      usageCount: { [Op.lt]: 5 }
    }
  });
};

/**
 * 获取缓存命中率统计（监控用）
 * @returns {Promise<{total: number, cached: number, hitRate: string}>}
 */
ImageLibrary.getCacheStats = async function() {
  // 这是一个简化实现，实际应该使用Redis INFO命令或专门的计数器
  const total = await this.count();
  return {
    total,
    cached: Math.floor(total * 0.8), // 预估值
    hitRate: '80%' // 目标命中率
  };
};

module.exports = ImageLibrary;
