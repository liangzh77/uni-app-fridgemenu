/**
 * AI服务
 * 通义千问菜谱推荐
 */
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../config/logger');
const { dashscopeConfig } = require('../config/aliyun');

// 通义千问API配置
const QWEN_API_URL = `${dashscopeConfig.baseUrl}/services/aigc/text-generation/generation`;
const QWEN_MODEL = dashscopeConfig.qwenModel || 'qwen-turbo';

/**
 * 调用通义千问API
 * @param {string} prompt - 提示词
 * @param {Object} options - 选项
 * @returns {Promise<string>} AI响应文本
 */
async function callQwenAPI(prompt, options = {}) {
  const {
    maxRetries = 3,
    temperature = 0.7,
    maxTokens = 2000
  } = options;

  let lastError = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.post(QWEN_API_URL, {
        model: QWEN_MODEL,
        input: {
          messages: [
            {
              role: 'system',
              content: '你是一个专业的中餐厨师助手，擅长根据食材推荐美味的家常菜。请用JSON格式回复。'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        },
        parameters: {
          temperature,
          max_tokens: maxTokens,
          result_format: 'message'
        }
      }, {
        headers: {
          'Authorization': `Bearer ${dashscopeConfig.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data.output && response.data.output.choices) {
        const result = response.data.output.choices[0].message.content;
        logger.info(`通义千问调用成功，Token消耗: ${response.data.usage?.total_tokens || 'N/A'}`);
        return result;
      } else {
        throw new Error('API响应格式错误');
      }
    } catch (error) {
      lastError = error;
      logger.warn(`通义千问调用失败 (${i + 1}/${maxRetries}):`, error.message);

      if (i < maxRetries - 1) {
        // 指数退避
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  logger.error('通义千问调用最终失败:', lastError);
  throw lastError;
}

/**
 * 根据食材推荐菜谱
 * @param {string[]} ingredients - 食材列表
 * @param {Object} options - 选项
 * @returns {Promise<Array<{dishName, ingredients, steps, cookingTime, difficulty, cuisineType, tips}>>}
 */
async function recommendRecipes(ingredients, options = {}) {
  const {
    count = 3,
    preferences = {},
    excludeDishes = []
  } = options;

  const ingredientList = ingredients.join('、');
  const excludeClause = excludeDishes.length > 0
    ? `不要推荐这些菜：${excludeDishes.join('、')}。`
    : '';

  const preferenceClause = preferences.cuisineType
    ? `偏好菜系：${preferences.cuisineType}。`
    : '';

  const difficultyClause = preferences.difficulty
    ? `难度要求：${preferences.difficulty === 'easy' ? '简单' : preferences.difficulty === 'hard' ? '复杂' : '适中'}。`
    : '';

  const prompt = `
根据以下食材推荐${count}道家常菜：${ingredientList}

要求：
1. 每道菜至少使用50%的输入食材
2. 推荐结果包含不同菜系或难度（至少80%结果体现多样性）
3. ${excludeClause}${preferenceClause}${difficultyClause}

请严格按照以下JSON格式返回：
{
  "recipes": [
    {
      "dishName": "菜名",
      "normalizedDishName": "规范化菜名（去除装饰性词汇）",
      "ingredients": [
        {"name": "食材名", "amount": "用量", "isMain": true}
      ],
      "steps": ["步骤1", "步骤2", "步骤3"],
      "cookingTime": 30,
      "difficulty": "easy|medium|hard",
      "cuisineType": "川菜|粤菜|鲁菜|苏菜|浙菜|闽菜|湘菜|徽菜|家常菜",
      "tips": "烹饪小贴士"
    }
  ]
}

注意：
- cookingTime是整数，单位分钟
- difficulty只能是easy、medium、hard三选一
- normalizedDishName应该是简洁的菜名，如"番茄炒蛋"而不是"妈妈的番茄炒蛋"
`;

  const response = await callQwenAPI(prompt);

  // 解析JSON响应
  try {
    // 提取JSON部分（处理可能包含的markdown代码块）
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const data = JSON.parse(jsonStr);
    const recipes = data.recipes || [];

    // 生成唯一hash
    return recipes.map(recipe => ({
      ...recipe,
      recipeHash: generateRecipeHash(recipe.normalizedDishName || recipe.dishName, ingredients)
    }));
  } catch (error) {
    logger.error('解析AI响应失败:', error, response);
    throw new Error('AI响应解析失败');
  }
}

/**
 * 生成菜谱哈希值
 * @param {string} dishName - 菜名
 * @param {string[]} ingredients - 食材列表
 * @returns {string} MD5哈希值
 */
function generateRecipeHash(dishName, ingredients) {
  const sortedIngredients = [...ingredients].sort().join(',');
  const str = `${dishName}:${sortedIngredients}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * 规范化菜名
 * @param {string} dishName - 原始菜名
 * @returns {string} 规范化后的菜名
 */
function normalizeDishName(dishName) {
  // 移除常见装饰性前缀
  const prefixes = [
    '正宗', '传统', '家常', '妈妈的', '外婆的', '爷爷的', '奶奶的',
    '秘制', '私房', '招牌', '特色', '经典', '改良', '创意'
  ];

  let normalized = dishName;
  for (const prefix of prefixes) {
    normalized = normalized.replace(new RegExp(`^${prefix}`, 'g'), '');
  }

  return normalized.trim();
}

module.exports = {
  callQwenAPI,
  recommendRecipes,
  generateRecipeHash,
  normalizeDishName
};
