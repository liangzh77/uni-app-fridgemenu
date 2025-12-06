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
    mainIngredients: [
      { name: '番茄', amount: '2个', isMain: true },
      { name: '鸡蛋', amount: '3个', isMain: true }
    ],
    seasonings: [
      { name: '葱', amount: '适量', isMain: false },
      { name: '盐', amount: '适量', isMain: false },
      { name: '白糖', amount: '少许', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['番茄切块，鸡蛋打散', '热锅凉油，炒散鸡蛋盛出', '另起油锅炒番茄出汁', '倒入鸡蛋翻炒，加盐调味'],
    cookingTime: 15,
    difficulty: 'easy',
    cuisineType: '家常菜',
    tips: '番茄要炒出汁，鸡蛋不要炒太老',
    score: 10
  },
  {
    dishName: '青椒土豆丝',
    normalizedDishName: '青椒土豆丝',
    mainIngredients: [
      { name: '土豆', amount: '2个', isMain: true },
      { name: '青椒', amount: '2个', isMain: true }
    ],
    seasonings: [
      { name: '蒜', amount: '3瓣', isMain: false },
      { name: '醋', amount: '适量', isMain: false },
      { name: '盐', amount: '适量', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['土豆切丝泡水去淀粉', '青椒切丝，蒜切末', '热锅爆香蒜末', '下土豆丝翻炒至断生，加青椒丝', '加醋、盐调味出锅'],
    cookingTime: 20,
    difficulty: 'easy',
    cuisineType: '家常菜',
    tips: '土豆丝要泡水去淀粉才会脆',
    score: 9
  },
  {
    dishName: '红烧肉',
    normalizedDishName: '红烧肉',
    mainIngredients: [
      { name: '五花肉', amount: '500g', isMain: true }
    ],
    seasonings: [
      { name: '冰糖', amount: '30g', isMain: false },
      { name: '生抽', amount: '2勺', isMain: false },
      { name: '老抽', amount: '1勺', isMain: false },
      { name: '姜', amount: '3片', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['五花肉切块焯水', '锅中放油炒糖色', '放入肉块翻炒上色', '加水没过肉，小火炖1小时', '大火收汁即可'],
    cookingTime: 90,
    difficulty: 'medium',
    cuisineType: '家常菜',
    tips: '小火慢炖才能入味软烂',
    score: 9
  },
  {
    dishName: '蒜蓉西兰花',
    normalizedDishName: '蒜蓉西兰花',
    mainIngredients: [
      { name: '西兰花', amount: '1颗', isMain: true }
    ],
    seasonings: [
      { name: '蒜', amount: '5瓣', isMain: false },
      { name: '蚝油', amount: '1勺', isMain: false },
      { name: '盐', amount: '适量', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['西兰花切小朵焯水', '蒜切末', '热锅下油爆香蒜末', '倒入西兰花翻炒', '加蚝油调味出锅'],
    cookingTime: 10,
    difficulty: 'easy',
    cuisineType: '粤菜',
    tips: '焯水时加点盐和油保持翠绿',
    score: 8
  },
  {
    dishName: '可乐鸡翅',
    normalizedDishName: '可乐鸡翅',
    mainIngredients: [
      { name: '鸡翅', amount: '8个', isMain: true },
      { name: '可乐', amount: '1罐', isMain: true }
    ],
    seasonings: [
      { name: '姜', amount: '3片', isMain: false },
      { name: '生抽', amount: '2勺', isMain: false },
      { name: '料酒', amount: '1勺', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['鸡翅划刀焯水', '热锅煎至两面金黄', '加姜片、生抽翻炒', '倒入可乐没过鸡翅', '大火烧开转小火炖20分钟', '大火收汁即可'],
    cookingTime: 35,
    difficulty: 'easy',
    cuisineType: '家常菜',
    tips: '用普通可乐，不要用无糖的',
    score: 8
  },
  {
    dishName: '鱼香肉丝',
    normalizedDishName: '鱼香肉丝',
    mainIngredients: [
      { name: '猪里脊', amount: '200g', isMain: true },
      { name: '木耳', amount: '适量', isMain: true },
      { name: '胡萝卜', amount: '1根', isMain: true }
    ],
    seasonings: [
      { name: '豆瓣酱', amount: '1勺', isMain: false },
      { name: '醋', amount: '1勺', isMain: false },
      { name: '白糖', amount: '1勺', isMain: false },
      { name: '生抽', amount: '1勺', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['肉丝上浆腌制', '配料切丝备用', '调鱼香汁：醋、糖、酱油、淀粉', '炒散肉丝盛出', '爆香豆瓣酱，下配菜翻炒', '倒入肉丝和鱼香汁翻炒均匀'],
    cookingTime: 25,
    difficulty: 'medium',
    cuisineType: '川菜',
    tips: '鱼香汁的酸甜比例是关键',
    score: 7
  },
  {
    dishName: '蒜苗炒肉',
    normalizedDishName: '蒜苗炒肉',
    mainIngredients: [
      { name: '蒜苗', amount: '200g', isMain: true },
      { name: '猪肉', amount: '150g', isMain: true }
    ],
    seasonings: [
      { name: '生抽', amount: '1勺', isMain: false },
      { name: '盐', amount: '适量', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['猪肉切片用生抽腌制', '蒜苗切段', '热锅炒散肉片', '下蒜苗大火翻炒', '加盐调味出锅'],
    cookingTime: 15,
    difficulty: 'easy',
    cuisineType: '家常菜',
    tips: '蒜苗要大火快炒保持脆嫩',
    score: 7
  },
  {
    dishName: '糖醋里脊',
    normalizedDishName: '糖醋里脊',
    mainIngredients: [
      { name: '猪里脊', amount: '300g', isMain: true }
    ],
    seasonings: [
      { name: '淀粉', amount: '适量', isMain: false },
      { name: '番茄酱', amount: '2勺', isMain: false },
      { name: '白醋', amount: '1勺', isMain: false },
      { name: '白糖', amount: '2勺', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['里脊切条腌制', '裹淀粉炸至金黄', '调糖醋汁', '锅中倒入糖醋汁煮开', '放入炸好的里脊翻炒均匀'],
    cookingTime: 30,
    difficulty: 'medium',
    cuisineType: '鲁菜',
    tips: '复炸一次更酥脆',
    score: 6
  },
  {
    dishName: '麻婆豆腐',
    normalizedDishName: '麻婆豆腐',
    mainIngredients: [
      { name: '豆腐', amount: '1块', isMain: true },
      { name: '肉末', amount: '100g', isMain: true }
    ],
    seasonings: [
      { name: '豆瓣酱', amount: '1勺', isMain: false },
      { name: '花椒', amount: '适量', isMain: false },
      { name: '姜蒜末', amount: '适量', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['豆腐切块焯水', '炒散肉末', '加豆瓣酱炒出红油', '加水烧开放入豆腐', '小火煮5分钟勾芡', '撒花椒粉出锅'],
    cookingTime: 20,
    difficulty: 'medium',
    cuisineType: '川菜',
    tips: '豆腐要嫩，花椒要香',
    score: 6
  },
  {
    dishName: '清炒时蔬',
    normalizedDishName: '清炒时蔬',
    mainIngredients: [
      { name: '青菜', amount: '300g', isMain: true }
    ],
    seasonings: [
      { name: '蒜', amount: '3瓣', isMain: false },
      { name: '盐', amount: '适量', isMain: false }
    ],
    get ingredients() { return [...this.mainIngredients, ...this.seasonings]; },
    steps: ['青菜洗净控水', '蒜切末', '热锅爆香蒜末', '下青菜大火翻炒', '加盐调味出锅'],
    cookingTime: 5,
    difficulty: 'easy',
    cuisineType: '家常菜',
    tips: '大火快炒保持翠绿',
    score: 5
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
 * 第一步：快速获取菜名推荐（轻量级，响应快）
 * @param {string[]} ingredients - 食材列表
 * @param {Object} options - 选项
 * @returns {Promise<Array<{dishName: string, score: number}>>}
 */
async function getRecipeNames(ingredients, options = {}) {
  const {
    count = 3,
    excludeDishes = []
  } = options;

  const ingredientList = ingredients.join('、');
  const excludeClause = excludeDishes.length > 0
    ? `不要推荐这些菜：${excludeDishes.join('、')}。`
    : '';

  const prompt = `用${ingredientList}，可以包含一些常用佐料，可以做什么饭菜？不要超出这些食材，可以只用其中一部分，给我列举${count}个做法，用json回复，推荐分数从1到10分，按照推荐分降序排序。${excludeClause}

格式如下：
[
  {"菜名": "青椒肉丝", "推荐": 10},
  {"菜名": "肉末蒸蛋", "推荐": 9}
]`;

  const response = await callQwenAPI(prompt, { maxTokens: 500 });

  try {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    // 尝试直接解析数组或从对象中提取
    let parsed = JSON.parse(jsonStr.trim());
    if (!Array.isArray(parsed)) {
      parsed = parsed.recipes || parsed.data || [];
    }

    return parsed.map(item => ({
      dishName: item['菜名'] || item.dishName || item.name,
      score: item['推荐'] || item.score || 5
    })).sort((a, b) => b.score - a.score);
  } catch (error) {
    logger.error('解析菜名响应失败:', error, response);
    throw new Error('AI响应解析失败');
  }
}

/**
 * 第二步：根据菜名获取详细食谱
 * @param {string} dishName - 菜名
 * @param {string[]} ingredients - 可用食材列表
 * @returns {Promise<Object>} 详细食谱
 */
async function getRecipeDetail(dishName, ingredients) {
  const ingredientList = ingredients.join('、');

  const prompt = `为"${dishName}"生成菜谱，采用食材（${ingredientList}），可以添加常用佐料，主食材不要超出这些食材，可以只用其中一部分。

【重要规则】
1. 主食材必须严格使用我提供的原始名称（${ingredientList}），不要使用同义词或别名。例如：如果我说"土豆"就用"土豆"，不要写成"马铃薯"；如果我说"西红柿"就用"西红柿"，不要写成"番茄"。
2. 配料只能是调味品和佐料，包括：葱、姜、蒜、酱油、生抽、老抽、醋、料酒、盐、糖、味精、鸡精、胡椒粉、花椒、辣椒、淀粉、食用油等。
3. 鸡蛋、肉类、蔬菜、豆腐、海鲜等食物必须归类为"主食材"，不能放在"配料"中。

格式如下：
{
  "菜名": "青椒肉丝",
  "主食材": [
    {"名称": "猪肉", "用量": "200g"},
    {"名称": "青椒", "用量": "2个"}
  ],
  "配料": [
    {"名称": "葱", "用量": "适量"},
    {"名称": "姜", "用量": "3片"},
    {"名称": "生抽", "用量": "1勺"},
    {"名称": "淀粉", "用量": "少许"},
    {"名称": "盐", "用量": "适量"}
  ],
  "做法": [
    "猪肉切丝，用生抽、淀粉、料酒抓匀腌制10分钟。",
    "青椒切丝备用。",
    "热锅凉油，下肉丝滑炒至变色盛出。",
    "锅底留油，下青椒丝大火快炒至断生，倒入肉丝，加盐和少许生抽调味，翻炒均匀出锅。"
  ]
}`;

  const response = await callQwenAPI(prompt, { maxTokens: 1000 });

  try {
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    const parsed = JSON.parse(jsonStr.trim());

    // 解析主食材
    const mainIngredients = (parsed['主食材'] || []).map(item => ({
      name: item['名称'] || item.name || item,
      amount: item['用量'] || item.amount || '适量',
      isMain: true
    }));

    // 解析配料/佐料
    const seasonings = (parsed['配料'] || []).map(item => ({
      name: item['名称'] || item.name || item,
      amount: item['用量'] || item.amount || '适量',
      isMain: false
    }));

    // 兼容旧格式：如果没有主食材和配料，尝试从"食材"字段解析
    if (mainIngredients.length === 0 && parsed['食材']) {
      const oldIngredients = parsed['食材'] || [];
      oldIngredients.forEach(name => {
        const isMain = ingredients.some(i => name.includes(i) || i.includes(name));
        if (isMain) {
          mainIngredients.push({ name, amount: '适量', isMain: true });
        } else {
          seasonings.push({ name, amount: '适量', isMain: false });
        }
      });
    }

    // 转换为标准格式
    return {
      dishName: parsed['菜名'] || dishName,
      mainIngredients,
      seasonings,
      // 保留 ingredients 字段用于兼容，合并主食材和配料
      ingredients: [...mainIngredients, ...seasonings],
      steps: parsed['做法'] || ['暂无详细步骤'],
      cookingTime: 20,
      difficulty: 'medium',
      cuisineType: '家常菜',
      tips: ''
    };
  } catch (error) {
    logger.error(`解析${dishName}食谱失败:`, error);
    // 返回基础结构，避免整个流程失败
    return {
      dishName,
      mainIngredients: [],
      seasonings: [],
      ingredients: [],
      steps: ['暂无详细步骤'],
      cookingTime: 20,
      difficulty: 'medium',
      cuisineType: '家常菜',
      tips: ''
    };
  }
}

/**
 * 根据食材推荐菜谱（两步式：先获取菜名，再并行获取详情）
 * @param {string[]} ingredients - 食材列表
 * @param {Object} options - 选项
 * @returns {Promise<Array<{dishName, ingredients, steps, cookingTime, difficulty, cuisineType, tips, score}>>}
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

  // 第一步：快速获取菜名列表
  logger.info(`[AI] 第一步：获取菜名推荐，食材: ${ingredients.join('、')}`);
  const startTime1 = Date.now();
  const recipeNames = await getRecipeNames(ingredients, { count, excludeDishes });
  logger.info(`[AI] 第一步完成，耗时 ${Date.now() - startTime1}ms，获取 ${recipeNames.length} 个菜名`);

  if (recipeNames.length === 0) {
    return [];
  }

  // 第二步：并行获取每个菜的详细信息
  logger.info(`[AI] 第二步：并行获取详细食谱...`);
  const startTime2 = Date.now();
  const detailPromises = recipeNames.map(async ({ dishName, score }) => {
    try {
      const detail = await getRecipeDetail(dishName, ingredients);
      return {
        ...detail,
        normalizedDishName: normalizeDishName(detail.dishName || dishName),
        score,
        recipeHash: generateRecipeHash(normalizeDishName(detail.dishName || dishName), ingredients)
      };
    } catch (error) {
      logger.warn(`获取${dishName}详情失败:`, error.message);
      return {
        dishName,
        normalizedDishName: normalizeDishName(dishName),
        ingredients: [],
        steps: ['暂无详细步骤'],
        cookingTime: 20,
        difficulty: 'medium',
        cuisineType: '家常菜',
        tips: '',
        score,
        recipeHash: generateRecipeHash(normalizeDishName(dishName), ingredients)
      };
    }
  });

  const recipes = await Promise.all(detailPromises);
  logger.info(`[AI] 第二步完成，耗时 ${Date.now() - startTime2}ms`);

  // 确保按score降序排序
  recipes.sort((a, b) => (b.score || 0) - (a.score || 0));

  return recipes;
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
  getRecipeNames,
  getRecipeDetail,
  recommendRecipes,
  generateRecipeHash,
  normalizeDishName
};
