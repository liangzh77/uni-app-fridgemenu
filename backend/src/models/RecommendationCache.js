/**
 * RecommendationCache 模型
 * 存储食材组合的推荐菜谱缓存
 */
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

const RecommendationCache = sequelize.define('RecommendationCache', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键ID'
  },
  ingredientsHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
    field: 'ingredients_hash',
    comment: '食材组合的哈希值（排序后MD5）'
  },
  ingredientsList: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'ingredients_list',
    comment: '食材列表（逗号分隔，用于显示）'
  },
  recipesJson: {
    type: DataTypes.JSON,
    allowNull: false,
    field: 'recipes_json',
    comment: '推荐的菜谱列表JSON（包含10个菜谱）',
    get() {
      const raw = this.getDataValue('recipesJson');
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  },
  totalCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
    field: 'total_count',
    comment: '菜谱总数'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at',
    comment: '缓存过期时间（可选，null表示永不过期）'
  }
}, {
  tableName: 'recommendation_cache',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['ingredients_hash'] },
    { fields: ['created_at'] },
    { fields: ['expires_at'] }
  ]
});

/**
 * 生成食材组合的哈希值
 * @param {string[]} ingredients - 食材列表
 * @returns {string} MD5哈希值
 */
RecommendationCache.generateIngredientsHash = function(ingredients) {
  // 排序后拼接，确保相同食材组合产生相同的哈希
  const sorted = [...ingredients].sort().join(',').toLowerCase();
  return crypto.createHash('md5').update(sorted).digest('hex');
};

/**
 * 根据食材查找缓存
 * @param {string[]} ingredients - 食材列表
 * @returns {Promise<RecommendationCache|null>}
 */
RecommendationCache.findByIngredients = async function(ingredients) {
  const hash = this.generateIngredientsHash(ingredients);
  const cache = await this.findOne({
    where: { ingredientsHash: hash }
  });

  // 检查是否过期
  if (cache && cache.expiresAt && new Date() > cache.expiresAt) {
    // 过期了，删除并返回null
    await cache.destroy();
    return null;
  }

  return cache;
};

/**
 * 创建或更新缓存
 * @param {string[]} ingredients - 食材列表
 * @param {Array} recipes - 菜谱列表
 * @param {number} expiresDays - 过期天数（可选，默认7天）
 * @returns {Promise<RecommendationCache>}
 */
RecommendationCache.upsertCache = async function(ingredients, recipes, expiresDays = 7) {
  const hash = this.generateIngredientsHash(ingredients);
  const ingredientsList = ingredients.join('、');
  const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000) : null;

  const [cache] = await this.upsert({
    ingredientsHash: hash,
    ingredientsList,
    recipesJson: recipes,
    totalCount: recipes.length,
    expiresAt
  });

  return cache;
};

/**
 * 清理过期缓存
 * @returns {Promise<number>} 删除的记录数
 */
RecommendationCache.cleanExpired = async function() {
  const { Op } = require('sequelize');
  const result = await this.destroy({
    where: {
      expiresAt: {
        [Op.lt]: new Date()
      }
    }
  });
  return result;
};

module.exports = RecommendationCache;
