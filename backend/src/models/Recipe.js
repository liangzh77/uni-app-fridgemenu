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
    comment: '食材列表JSON（兼容旧数据，包含所有食材）',
    get() {
      const raw = this.getDataValue('ingredientsJson');
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  },
  mainIngredientsJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'main_ingredients_json',
    comment: '主食材列表JSON（用于搜索匹配）',
    get() {
      const raw = this.getDataValue('mainIngredientsJson');
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  },
  seasoningsJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'seasonings_json',
    comment: '配料/佐料列表JSON',
    get() {
      const raw = this.getDataValue('seasoningsJson');
      if (!raw) return null;
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
 * 只匹配【主食材】，忽略配料/佐料
 * 要求：菜谱的主食材必须【包含用户的所有食材】（精确匹配）
 * 即：用户选择的每个食材都必须出现在菜谱的主食材中
 * @param {string[]} ingredients - 用户食材名称列表
 * @param {number} limit - 返回数量限制
 * @returns {Promise<Recipe[]>}
 */
Recipe.findByIngredients = async function(ingredients, limit = 10) {
  // 获取所有菜谱
  const recipes = await this.findAll({
    order: [['created_at', 'DESC']]
  });

  // 用户食材列表（小写，去空格）
  const userIngredients = ingredients.map(i => i.toLowerCase().trim());

  // 过滤：菜谱的主食材必须【包含用户的所有食材】
  const matched = recipes.filter(recipe => {
    // 优先使用 mainIngredientsJson，如果没有则从 ingredientsJson 中筛选 isMain=true 的
    let mainIngredients = recipe.mainIngredientsJson;

    if (!mainIngredients || mainIngredients.length === 0) {
      // 兼容旧数据：从 ingredientsJson 中筛选主食材
      const allIngredients = recipe.ingredientsJson || [];
      mainIngredients = allIngredients.filter(i => i.isMain === true);

      // 如果没有标记 isMain，则认为所有都是主食材（旧数据兼容）
      if (mainIngredients.length === 0) {
        mainIngredients = allIngredients;
      }
    }

    const recipeMainIngredients = mainIngredients.map(i =>
      (i.name || i).toLowerCase().trim()
    );

    // 用户的【每一个食材】都必须在菜谱的主食材中找到【精确匹配】
    // 即：菜谱主食材必须包含用户的所有食材
    return userIngredients.every(userIng =>
      recipeMainIngredients.some(recipeIng => recipeIng === userIng)
    );
  });

  return matched.slice(0, limit);
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
    mainIngredientsJson: aiResponse.mainIngredients || null,
    seasoningsJson: aiResponse.seasonings || null,
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
