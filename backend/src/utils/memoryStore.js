/**
 * 内存存储模块
 * 用于开发模式当数据库不可用时的数据存储
 * 被 ingredients.js、recipeService.js 和 favorites.js 共享
 */

// 食材内存存储
const ingredientStore = new Map();

// 菜谱内存存储（按规范化菜名索引）
const recipeStore = new Map();

// 收藏内存存储（按用户ID索引，值为recipeId数组）
const favoriteStore = new Map();

// 计数器
let mockIdCounter = 1;

/**
 * 获取存储键
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @returns {string} 存储键
 */
const getStoreKey = (userId, sessionId) => `${userId}:${sessionId}`;

/**
 * 获取下一个模拟ID
 * @returns {number} 模拟ID
 */
const getNextMockId = () => mockIdCounter++;

/**
 * 根据ID获取内存中的菜谱
 * @param {number} recipeId - 菜谱ID
 * @returns {Object|null} 菜谱对象
 */
const getRecipeById = (recipeId) => {
  for (const recipe of recipeStore.values()) {
    if (recipe.id === recipeId) {
      return recipe;
    }
  }
  return null;
};

/**
 * 获取用户收藏列表
 * @param {string} userId - 用户ID
 * @returns {number[]} 收藏的菜谱ID数组
 */
const getUserFavorites = (userId) => {
  return favoriteStore.get(userId) || [];
};

/**
 * 切换收藏状态
 * @param {string} userId - 用户ID
 * @param {number} recipeId - 菜谱ID
 * @returns {{isFavorited: boolean}} 切换后的状态
 */
const toggleFavorite = (userId, recipeId) => {
  let favorites = favoriteStore.get(userId) || [];
  const index = favorites.indexOf(recipeId);

  if (index === -1) {
    favorites.push(recipeId);
    favoriteStore.set(userId, favorites);
    return { isFavorited: true };
  } else {
    favorites.splice(index, 1);
    favoriteStore.set(userId, favorites);
    return { isFavorited: false };
  }
};

/**
 * 检查是否已收藏
 * @param {string} userId - 用户ID
 * @param {number} recipeId - 菜谱ID
 * @returns {boolean} 是否已收藏
 */
const isFavorited = (userId, recipeId) => {
  const favorites = favoriteStore.get(userId) || [];
  return favorites.includes(recipeId);
};

module.exports = {
  ingredientStore,
  recipeStore,
  favoriteStore,
  getStoreKey,
  getNextMockId,
  getRecipeById,
  getUserFavorites,
  toggleFavorite,
  isFavorited
};
