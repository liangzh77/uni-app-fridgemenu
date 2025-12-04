/**
 * FoodSynonymMapping 模型
 * 食材同义词映射
 */
const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { getCache, setCache } = require('../config/redis');
const logger = require('../config/logger');

// Redis缓存配置
const CACHE_KEY = 'food:synonyms:all';
const CACHE_TTL = 24 * 60 * 60; // 24小时

const FoodSynonymMapping = sequelize.define('FoodSynonymMapping', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    comment: '主键ID'
  },
  synonymName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'synonym_name',
    comment: '同义词名称'
  },
  standardName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'standard_name',
    comment: '标准名称'
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '分类'
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '优先级（越高越优先）'
  }
}, {
  tableName: 'food_synonym_mapping',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['synonym_name'] },
    { fields: ['standard_name'] },
    { fields: ['category'] }
  ]
});

// 内存缓存（提升查询性能）
let synonymMap = null;
let lastLoadTime = null;
const MEMORY_CACHE_TTL = 60 * 60 * 1000; // 1小时

/**
 * 类方法扩展
 */

/**
 * 加载所有同义词到内存
 * @returns {Promise<Map<string, {standardName: string, category: string}>>}
 */
FoodSynonymMapping.loadSynonymMap = async function() {
  // 检查内存缓存是否有效
  if (synonymMap && lastLoadTime && (Date.now() - lastLoadTime < MEMORY_CACHE_TTL)) {
    return synonymMap;
  }

  // 尝试从Redis缓存获取
  try {
    const cached = await getCache(CACHE_KEY);
    if (cached) {
      synonymMap = new Map(Object.entries(cached));
      lastLoadTime = Date.now();
      logger.debug('从Redis加载同义词映射');
      return synonymMap;
    }
  } catch (err) {
    logger.warn('Redis缓存读取失败:', err);
  }

  // 从数据库加载
  const records = await this.findAll({
    order: [['priority', 'DESC']]
  });

  synonymMap = new Map();
  const cacheObj = {};

  for (const record of records) {
    const key = record.synonymName.toLowerCase();
    const value = {
      standardName: record.standardName,
      category: record.category
    };
    synonymMap.set(key, value);
    cacheObj[key] = value;
  }

  lastLoadTime = Date.now();

  // 写入Redis缓存
  try {
    await setCache(CACHE_KEY, cacheObj, CACHE_TTL);
  } catch (err) {
    logger.warn('Redis缓存写入失败:', err);
  }

  logger.info(`加载了 ${records.length} 条食材同义词映射`);
  return synonymMap;
};

/**
 * 规范化单个食材名称
 * 算法步骤（TASK-025详细实现）：
 * 1. 输入预处理：去除空格、标点
 * 2. 查询同义词表
 * 3. 返回标准名或原名
 *
 * @param {string} ingredientName - 原始食材名称
 * @returns {Promise<{standardName: string, category: string|null, isNormalized: boolean}>}
 */
FoodSynonymMapping.normalize = async function(ingredientName) {
  // 步骤1: 输入预处理
  const cleaned = ingredientName
    .trim()
    .toLowerCase()
    .replace(/[，。、！？\s]+/g, ''); // 去除中文标点和空格

  // 步骤2: 加载同义词映射
  const map = await this.loadSynonymMap();

  // 步骤3: 查找标准名
  if (map.has(cleaned)) {
    const { standardName, category } = map.get(cleaned);
    return {
      standardName,
      category,
      isNormalized: true
    };
  }

  // 未找到匹配，返回原名（首字母大写处理）
  return {
    standardName: ingredientName.trim(),
    category: null,
    isNormalized: false
  };
};

/**
 * 批量规范化食材名称
 * @param {string[]} ingredientNames - 原始食材名称数组
 * @returns {Promise<Array<{original: string, standardName: string, category: string|null, isNormalized: boolean}>>}
 */
FoodSynonymMapping.normalizeAll = async function(ingredientNames) {
  // 确保映射已加载
  await this.loadSynonymMap();

  const results = [];
  for (const name of ingredientNames) {
    const normalized = await this.normalize(name);
    results.push({
      original: name,
      ...normalized
    });
  }

  return results;
};

/**
 * 添加新的同义词映射
 * @param {string} synonymName - 同义词
 * @param {string} standardName - 标准名
 * @param {string} category - 分类
 * @param {number} priority - 优先级
 * @returns {Promise<FoodSynonymMapping>}
 */
FoodSynonymMapping.addSynonym = async function(synonymName, standardName, category = null, priority = 50) {
  const [record, created] = await this.findOrCreate({
    where: { synonymName: synonymName.toLowerCase() },
    defaults: {
      synonymName: synonymName.toLowerCase(),
      standardName,
      category,
      priority
    }
  });

  if (!created) {
    // 更新已存在的记录
    await record.update({ standardName, category, priority });
  }

  // 刷新缓存
  synonymMap = null;
  lastLoadTime = null;

  return record;
};

/**
 * 根据标准名获取所有同义词
 * @param {string} standardName - 标准名称
 * @returns {Promise<string[]>}
 */
FoodSynonymMapping.getSynonyms = async function(standardName) {
  const records = await this.findAll({
    where: { standardName },
    attributes: ['synonymName']
  });
  return records.map(r => r.synonymName);
};

/**
 * 获取指定分类的所有食材
 * @param {string} category - 分类名称
 * @returns {Promise<string[]>} 标准名称列表
 */
FoodSynonymMapping.getByCategory = async function(category) {
  const records = await this.findAll({
    where: { category },
    attributes: ['standardName'],
    group: ['standardName']
  });
  return [...new Set(records.map(r => r.standardName))];
};

/**
 * 刷新缓存
 */
FoodSynonymMapping.refreshCache = function() {
  synonymMap = null;
  lastLoadTime = null;
  logger.info('食材同义词缓存已刷新');
};

module.exports = FoodSynonymMapping;
