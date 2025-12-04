/**
 * Recipe 模型
 * 菜谱信息
 */
const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');

const Recipe = sequelize.define('Recipe', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键ID'
  },
  dishName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'dish_name',
    comment: '菜名'
  },
  normalizedDishName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'normalized_dish_name',
    comment: '规范化菜名'
  },
  ingredientsJson: {
    type: DataTypes.JSON,
    allowNull: false,
    field: 'ingredients_json',
    comment: '食材列表JSON',
    get() {
      const raw = this.getDataValue('ingredientsJson');
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  },
  stepsJson: {
    type: DataTypes.JSON,
    allowNull: false,
    field: 'steps_json',
    comment: '制作步骤JSON',
    get() {
      const raw = this.getDataValue('stepsJson');
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  },
  cookingTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'cooking_time',
    comment: '烹饪时长(分钟)'
  },
  difficulty: {
    type: DataTypes.ENUM('easy', 'medium', 'hard'),
    defaultValue: 'medium',
    comment: '难度等级'
  },
  cuisineType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'cuisine_type',
    comment: '菜系类型'
  },
  tips: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '烹饪小贴士'
  },
  imageLibraryId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'image_library_id',
    comment: '关联的图片库ID'
  }
}, {
  tableName: 'recipes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['dish_name'] },
    { fields: ['normalized_dish_name'] },
    { fields: ['cuisine_type'] },
    { fields: ['created_at'] }
  ]
});

/**
 * 类方法扩展
 */

/**
 * 根据菜名查询菜谱
 * @param {string} dishName - 菜名
 * @returns {Promise<Recipe|null>}
 */
Recipe.findByDishName = async function(dishName) {
  return this.findOne({
    where: {
      [Op.or]: [
        { dishName },
        { normalizedDishName: dishName }
      ]
    }
  });
};

/**
 * 根据食材列表查询可能的菜谱
 * @param {string[]} ingredients - 食材名称列表
 * @param {number} limit - 返回数量限制
 * @returns {Promise<Recipe[]>}
 */
Recipe.findByIngredients = async function(ingredients, limit = 10) {
  // 使用JSON_CONTAINS查询包含指定食材的菜谱
  // 注意：这是一个简化实现，实际可能需要更复杂的匹配逻辑
  const recipes = await this.findAll({
    limit,
    order: [['created_at', 'DESC']]
  });

  // 过滤包含至少一个指定食材的菜谱
  return recipes.filter(recipe => {
    const recipeIngredients = recipe.ingredientsJson.map(i =>
      (i.name || i).toLowerCase()
    );
    return ingredients.some(ing =>
      recipeIngredients.some(ri => ri.includes(ing.toLowerCase()))
    );
  });
};

/**
 * 创建菜谱（从AI响应）
 * @param {Object} aiResponse - AI返回的菜谱数据
 * @param {string} normalizedDishName - 规范化菜名
 * @returns {Promise<Recipe>}
 */
Recipe.createFromAI = async function(aiResponse, normalizedDishName) {
  return this.create({
    dishName: aiResponse.dishName || aiResponse.dish_name,
    normalizedDishName,
    ingredientsJson: aiResponse.ingredients,
    stepsJson: aiResponse.steps,
    cookingTime: aiResponse.cookingTime || aiResponse.cooking_time,
    difficulty: aiResponse.difficulty || 'medium',
    cuisineType: aiResponse.cuisineType || aiResponse.cuisine_type,
    tips: aiResponse.tips
  });
};

/**
 * 关联图片库
 * @param {number} recipeId - 菜谱ID
 * @param {number} imageLibraryId - 图片库ID
 * @returns {Promise<[number]>}
 */
Recipe.linkImage = async function(recipeId, imageLibraryId) {
  return this.update(
    { imageLibraryId },
    { where: { id: recipeId } }
  );
};

/**
 * 分页查询菜谱
 * @param {Object} options - 查询选项
 * @param {number} options.page - 页码
 * @param {number} options.pageSize - 每页数量
 * @param {string} options.cuisineType - 菜系过滤
 * @param {string} options.difficulty - 难度过滤
 * @returns {Promise<{rows: Recipe[], count: number}>}
 */
Recipe.paginate = async function(options = {}) {
  const {
    page = 1,
    pageSize = 10,
    cuisineType,
    difficulty
  } = options;

  const where = {};
  if (cuisineType) where.cuisineType = cuisineType;
  if (difficulty) where.difficulty = difficulty;

  return this.findAndCountAll({
    where,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    order: [['created_at', 'DESC']]
  });
};

module.exports = Recipe;
