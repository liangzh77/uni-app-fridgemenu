/**
 * 语音服务
 * 处理语音文本解析、食材提取
 */
const logger = require('../config/logger');
const { FoodSynonymMapping } = require('../models');

// 停用词列表（用于过滤非食材词汇）
const STOP_WORDS = [
  '我有', '家里有', '冰箱里有', '冰箱有', '厨房有',
  '还有', '和', '跟', '以及', '然后', '另外',
  '一些', '几个', '点', '块', '斤', '两', '克', '个',
  '新鲜', '很多', '一点', '一点点', '不多',
  '今天', '昨天', '刚买', '买了',
  '可以', '做', '吃', '煮', '炒', '烧'
];

// 数量词模式
const QUANTITY_PATTERN = /(\d+(?:\.\d+)?)\s*(斤|两|克|kg|g|个|根|颗|块|片|把|袋|盒|瓶)/gi;

/**
 * 解析语音文本，提取食材
 * @param {string} text - 语音识别文本
 * @returns {Promise<Array<{name: string, quantity?: number, unit?: string}>>}
 */
async function parseVoiceText(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  logger.info(`解析语音文本: ${text}`);

  // 1. 预处理文本
  let cleanText = text.trim();

  // 2. 移除停用词
  for (const word of STOP_WORDS) {
    cleanText = cleanText.replace(new RegExp(word, 'gi'), ' ');
  }

  // 3. 提取数量信息（在分割之前）
  const quantityMap = new Map();
  const quantityMatches = [...cleanText.matchAll(QUANTITY_PATTERN)];
  for (const match of quantityMatches) {
    // 记录数量和单位，稍后与食材关联
    const fullMatch = match[0];
    const amount = parseFloat(match[1]);
    const unit = match[2];
    quantityMap.set(fullMatch, { quantity: amount, unit });
  }

  // 4. 按分隔符分割
  const parts = cleanText
    .split(/[,，、。；;！!？?\s]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // 5. 提取食材
  const ingredients = [];
  const seen = new Set();

  for (const part of parts) {
    // 跳过纯数字或太短的词
    if (/^\d+$/.test(part) || part.length < 1) {
      continue;
    }

    // 清理数量部分，提取食材名
    let ingredientName = part.replace(QUANTITY_PATTERN, '').trim();

    // 跳过空白或太长的词
    if (!ingredientName || ingredientName.length > 20) {
      continue;
    }

    // 规范化食材名称
    const normalized = await FoodSynonymMapping.normalize(ingredientName);
    const name = normalized.standardName;

    // 去重
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    // 查找关联的数量信息
    let quantity = null;
    let unit = null;
    for (const [matchText, info] of quantityMap.entries()) {
      if (part.includes(matchText)) {
        quantity = info.quantity;
        unit = info.unit;
        break;
      }
    }

    ingredients.push({
      name,
      originalName: ingredientName !== name ? ingredientName : undefined,
      category: normalized.category,
      quantity,
      unit
    });
  }

  logger.info(`提取到 ${ingredients.length} 个食材: ${ingredients.map(i => i.name).join(', ')}`);

  return ingredients;
}

/**
 * 智能补全食材（基于常见搭配）
 * @param {string[]} ingredients - 已有食材列表
 * @returns {Promise<string[]>} 建议补充的食材
 */
async function suggestIngredients(ingredients) {
  // 常见食材搭配规则
  const pairings = {
    '番茄': ['鸡蛋', '白糖'],
    '土豆': ['青椒', '牛肉'],
    '鸡肉': ['姜', '料酒', '葱'],
    '猪肉': ['姜', '蒜', '酱油'],
    '牛肉': ['洋葱', '青椒'],
    '豆腐': ['葱', '姜'],
    '鱼': ['姜', '葱', '料酒'],
    '虾': ['姜', '蒜', '料酒']
  };

  const suggestions = new Set();
  const existingSet = new Set(ingredients.map(i => i.toLowerCase()));

  for (const ingredient of ingredients) {
    const pairs = pairings[ingredient];
    if (pairs) {
      for (const pair of pairs) {
        if (!existingSet.has(pair.toLowerCase())) {
          suggestions.add(pair);
        }
      }
    }
  }

  return [...suggestions].slice(0, 5); // 最多返回5个建议
}

/**
 * 验证食材是否有效
 * @param {string} name - 食材名称
 * @returns {boolean}
 */
function isValidIngredient(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }

  const trimmed = name.trim();

  // 长度检查
  if (trimmed.length < 1 || trimmed.length > 20) {
    return false;
  }

  // 不能是纯数字
  if (/^\d+$/.test(trimmed)) {
    return false;
  }

  // 不能包含特殊字符
  if (/[<>{}[\]\\\/]/.test(trimmed)) {
    return false;
  }

  return true;
}

module.exports = {
  parseVoiceText,
  suggestIngredients,
  isValidIngredient,
  STOP_WORDS
};
