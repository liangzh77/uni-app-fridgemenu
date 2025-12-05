/**
 * 模型索引文件
 * 统一导出所有模型，并设置模型关联
 */
const { sequelize } = require('../config/database');
const Ingredient = require('./Ingredient');
const Recipe = require('./Recipe');
const Favorite = require('./Favorite');
const ImageLibrary = require('./ImageLibrary');
const FoodSynonymMapping = require('./FoodSynonymMapping');
const RecommendationCache = require('./RecommendationCache');

// 设置模型关联

// Recipe 与 ImageLibrary 的关联 (一对一)
Recipe.belongsTo(ImageLibrary, {
  foreignKey: 'imageLibraryId',
  as: 'image'
});
ImageLibrary.hasMany(Recipe, {
  foreignKey: 'imageLibraryId',
  as: 'recipes'
});

// Favorite 与 Recipe 的关联 (多对一)
Favorite.belongsTo(Recipe, {
  foreignKey: 'recipeId',
  as: 'recipe'
});
Recipe.hasMany(Favorite, {
  foreignKey: 'recipeId',
  as: 'favorites'
});

/**
 * 同步所有模型到数据库
 * @param {Object} options - Sequelize sync选项
 * @returns {Promise<void>}
 */
async function syncModels(options = {}) {
  await sequelize.sync(options);
}

/**
 * 测试数据库连接
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    await sequelize.authenticate();
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  sequelize,
  Ingredient,
  Recipe,
  Favorite,
  ImageLibrary,
  FoodSynonymMapping,
  RecommendationCache,
  syncModels,
  testConnection
};
