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

// 检查是否使用Mock模式（API密钥是占位符或未设置）
const useMockMode = () => {
  const apiKey = dashscopeConfig.apiKey;
  return !apiKey || apiKey === 'your_dashscope_api_key' || apiKey.startsWith('your_');
};

// Mock菜谱数据库
const MOCK_RECIPES = [
  {
    dishName: '番茄炒蛋',
    normalizedDishName: '番茄炒蛋',
    ingredients: [
      { name: '番茄', amount: '2个', isMain: true },
      { name: '鸡蛋', amount: '3个', isMain: true },
      { name: '葱', amount: '适量', isMain: false },
      { name: '盐', amount: '适量', isMain: false }
    ],
    steps: ['番茄切块，鸡蛋打散', '热锅凉油，炒散鸡蛋盛出', '另起油锅炒番茄出汁', '倒入鸡蛋翻炒，加盐调味'],
    cookingTime: 15,
    difficulty: 'easy',
    cuisineType: '家常菜',
    tips: '番茄要炒出汁，鸡蛋不要炒太老'
  },
  {
    dishName: '青椒土豆丝',
    normalizedDishName: '青椒土豆丝',
    ingredients: [
      { name: '土豆', amount: '2个', isMain: true },
      { name: '青椒', amount: '2个', isMain: true },
      { name: '蒜', amount: '3瓣', isMain: false },
      { name: '醋', amount: '适量', isMain: false }
    ],
    steps: ['土豆切丝泡水去淀粉', '青椒切丝，蒜切末', '热锅爆香蒜末', '下土豆丝翻炒至断生，加青椒丝', '加醋、盐调味出锅'],
    cookingTime: 20,
    difficulty: 'easy',
    cuisineType: '家常菜',
    tips: '土豆丝要泡水去淀粉才会脆'
  },
  {
    dishName: '红烧肉',
    normalizedDishName: '红烧肉',
    ingredients: [
      { name: '五花肉', amount: '500g', isMain: true },
      { name: '冰糖', amount: '30g', isMain: false },
      { name: '生抽', amount: '2勺', isMain: false },
      { name: '老抽', amount: '1勺', isMain: false }
    ],
    steps: ['五花肉切块焯水', '锅中放油炒糖色', '放入肉块翻炒上色', '加水没过肉，小火炖1小时', '大火收汁即可'],
    cookingTime: 90,
    difficulty: 'medium',
    cuisineType: '家常菜',
    tips: '小火慢炖才能入味软烂'
  },
  {
    dishName: '蒜蓉西兰花',
    normalizedDishName: '蒜蓉西兰花',
    ingredients: [
      { name: '西兰花', amount: '1颗', isMain: true },
      { name: '蒜', amount: '5瓣', isMain: true },
      { name: '蚝油', amount: '1勺', isMain: false }
    ],
    steps: ['西兰花切小朵焯水', '蒜切末', '热锅下油爆香蒜末', '倒入西兰花翻炒', '加蚝油调味出锅'],
    cookingTime: 10,
    difficulty: 'easy',
    cuisineType: '粤菜',
    tips: '焯水时加点盐和油保持翠绿'
  },
  {
    dishName: '可乐鸡翅',
    normalizedDishName: '可乐鸡翅',
    ingredients: [
      { name: '鸡翅', amount: '8个', isMain: true },
      { name: '可乐', amount: '1罐', isMain: true },
      { name: '姜', amount: '3片', isMain: false },
      { name: '生抽', amount: '2勺', isMain: false }
    ],
    steps: ['鸡翅划刀焯水', '热锅煎至两面金黄', '加姜片、生抽翻炒', '倒入可乐没过鸡翅', '大火烧开转小火炖20分钟', '大火收汁即可'],
    cookingTime: 35,
    difficulty: 'easy',
    cuisineType: '家常菜',
    tips: '用普通可乐，不要用无糖的'
  },
  {
    dishName: '鱼香肉丝',
    normalizedDishName: '鱼香肉丝',
    ingredients: [
      { name: '猪里脊', amount: '200g', isMain: true },
      { name: '木耳', amount: '适量', isMain: true },
      { name: '胡萝卜', amount: '1根', isMain: false },
      { name: '豆瓣酱', amount: '1勺', isMain: false }
    ],
    steps: ['肉丝上浆腌制', '配料切丝备用', '调鱼香汁：醋、糖、酱油、淀粉', '炒散肉丝盛出', '爆香豆瓣酱，下配菜翻炒', '倒入肉丝和鱼香汁翻炒均匀'],
    cookingTime: 25,
    difficulty: 'medium',
    cuisineType: '川菜',
    tips: '鱼香汁的酸甜比例是关键'
  }
];

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
 * 根据食材推荐菜谱（Mock模式）
 * @param {string[]} ingredients - 食材列表
 * @param {number} count - 推荐数量
 * @param {string[]} excludeDishes - 排除的菜名
 * @returns {Array} 模拟菜谱列表
 */
function getMockRecipes(ingredients, count = 3, excludeDishes = []) {
  logger.info(`[Mock模式] 使用模拟数据推荐菜谱，食材: ${ingredients.join('、')}`);

  // 过滤掉已排除的菜
  let available = MOCK_RECIPES.filter(r => !excludeDishes.includes(r.dishName));

  // 随机打乱并选取指定数量
  const shuffled = available.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  // 添加recipeHash
  return selected.map(recipe => ({
    ...recipe,
    recipeHash: generateRecipeHash(recipe.normalizedDishName, ingredients)
  }));
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

  // 检查是否使用Mock模式
  if (useMockMode()) {
    logger.warn('AI服务使用Mock模式（API密钥未配置或为占位符）');
    return getMockRecipes(ingredients, count, excludeDishes);
  }

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
