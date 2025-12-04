/**
 * Ingredient 模型
 * 用户食材记录
 */
const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');

const Ingredient = sequelize.define('Ingredient', {
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
  sessionId: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'session_id',
    comment: '会话ID'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '食材名称（规范化后）'
  },
  originalName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'original_name',
    comment: '原始输入名称'
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '食材分类'
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: '数量'
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '单位'
  }
}, {
  tableName: 'ingredients',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['session_id'] },
    { fields: ['created_at'] }
  ]
});

/**
 * 类方法扩展
 */

/**
 * 根据用户ID查询食材列表
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID (可选)
 * @returns {Promise<Ingredient[]>}
 */
Ingredient.findByUserId = async function(userId, sessionId = null) {
  const where = { userId };
  if (sessionId) {
    where.sessionId = sessionId;
  }
  return this.findAll({
    where,
    order: [['created_at', 'DESC']]
  });
};

/**
 * 批量创建食材（自动去重）
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @param {Array<{name: string, originalName?: string, category?: string, quantity?: number, unit?: string}>} ingredients - 食材列表
 * @returns {Promise<{created: Ingredient[], skipped: string[]}>}
 */
Ingredient.bulkCreateWithDedup = async function(userId, sessionId, ingredients) {
  const created = [];
  const skipped = [];

  // 获取该用户当前会话已有的食材
  const existing = await this.findAll({
    where: { userId, sessionId },
    attributes: ['name']
  });
  const existingNames = new Set(existing.map(i => i.name.toLowerCase()));

  for (const item of ingredients) {
    const normalizedName = item.name.toLowerCase();

    // 检查是否已存在
    if (existingNames.has(normalizedName)) {
      skipped.push(item.name);
      continue;
    }

    // 创建新食材
    const ingredient = await this.create({
      userId,
      sessionId,
      name: item.name,
      originalName: item.originalName || item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit
    });

    created.push(ingredient);
    existingNames.add(normalizedName);
  }

  return { created, skipped };
};

/**
 * 删除用户指定食材
 * @param {string} userId - 用户ID
 * @param {number|number[]} ingredientIds - 食材ID或ID数组
 * @returns {Promise<number>} 删除的数量
 */
Ingredient.deleteByUserAndIds = async function(userId, ingredientIds) {
  const ids = Array.isArray(ingredientIds) ? ingredientIds : [ingredientIds];
  return this.destroy({
    where: {
      userId,
      id: { [Op.in]: ids }
    }
  });
};

/**
 * 清空用户当前会话的所有食材
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @returns {Promise<number>} 删除的数量
 */
Ingredient.clearSession = async function(userId, sessionId) {
  return this.destroy({
    where: { userId, sessionId }
  });
};

/**
 * 获取用户食材列表（仅名称）
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @returns {Promise<string[]>} 食材名称数组
 */
Ingredient.getIngredientNames = async function(userId, sessionId) {
  const ingredients = await this.findAll({
    where: { userId, sessionId },
    attributes: ['name']
  });
  return ingredients.map(i => i.name);
};

module.exports = Ingredient;
