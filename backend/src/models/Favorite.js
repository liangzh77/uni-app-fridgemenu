/**
 * Favorite 模型
 * 用户收藏记录
 */
const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');

const Favorite = sequelize.define('Favorite', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键ID'
  },
  userId: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'user_id',
    comment: '用户ID'
  },
  recipeId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'recipe_id',
    comment: '菜谱ID'
  },
  favoritedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'favorited_at',
    comment: '收藏时间'
  }
}, {
  tableName: 'favorites',
  timestamps: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['recipe_id'] },
    { fields: ['favorited_at'] },
    {
      unique: true,
      fields: ['user_id', 'recipe_id'],
      name: 'uk_user_recipe'
    }
  ]
});

/**
 * 类方法扩展
 */

/**
 * 收藏菜谱
 * @param {string} userId - 用户ID
 * @param {number} recipeId - 菜谱ID
 * @returns {Promise<{favorite: Favorite, created: boolean}>}
 */
Favorite.addFavorite = async function(userId, recipeId) {
  const [favorite, created] = await this.findOrCreate({
    where: { userId, recipeId },
    defaults: { favoritedAt: new Date() }
  });
  return { favorite, created };
};

/**
 * 取消收藏
 * @param {string} userId - 用户ID
 * @param {number} recipeId - 菜谱ID
 * @returns {Promise<boolean>} 是否成功删除
 */
Favorite.removeFavorite = async function(userId, recipeId) {
  const deleted = await this.destroy({
    where: { userId, recipeId }
  });
  return deleted > 0;
};

/**
 * 切换收藏状态
 * @param {string} userId - 用户ID
 * @param {number} recipeId - 菜谱ID
 * @returns {Promise<{isFavorited: boolean, favorite?: Favorite}>}
 */
Favorite.toggleFavorite = async function(userId, recipeId) {
  const existing = await this.findOne({
    where: { userId, recipeId }
  });

  if (existing) {
    await existing.destroy();
    return { isFavorited: false };
  } else {
    const favorite = await this.create({
      userId,
      recipeId,
      favoritedAt: new Date()
    });
    return { isFavorited: true, favorite };
  }
};

/**
 * 检查是否已收藏
 * @param {string} userId - 用户ID
 * @param {number} recipeId - 菜谱ID
 * @returns {Promise<boolean>}
 */
Favorite.isFavorited = async function(userId, recipeId) {
  const count = await this.count({
    where: { userId, recipeId }
  });
  return count > 0;
};

/**
 * 批量检查收藏状态
 * @param {string} userId - 用户ID
 * @param {number[]} recipeIds - 菜谱ID数组
 * @returns {Promise<Map<number, boolean>>}
 */
Favorite.checkFavorites = async function(userId, recipeIds) {
  const favorites = await this.findAll({
    where: {
      userId,
      recipeId: { [Op.in]: recipeIds }
    },
    attributes: ['recipeId']
  });

  const favoritedSet = new Set(favorites.map(f => f.recipeId));
  const result = new Map();

  recipeIds.forEach(id => {
    result.set(id, favoritedSet.has(id));
  });

  return result;
};

/**
 * 获取用户收藏列表（分页）
 * @param {string} userId - 用户ID
 * @param {Object} options - 分页选项
 * @param {number} options.page - 页码
 * @param {number} options.pageSize - 每页数量
 * @returns {Promise<{rows: Favorite[], count: number}>}
 */
Favorite.getUserFavorites = async function(userId, options = {}) {
  const { page = 1, pageSize = 10 } = options;

  return this.findAndCountAll({
    where: { userId },
    limit: pageSize,
    offset: (page - 1) * pageSize,
    order: [['favorited_at', 'DESC']]
  });
};

/**
 * 获取用户收藏数量
 * @param {string} userId - 用户ID
 * @returns {Promise<number>}
 */
Favorite.countUserFavorites = async function(userId) {
  return this.count({ where: { userId } });
};

module.exports = Favorite;
