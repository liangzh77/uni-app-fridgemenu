/**
 * 菜谱相关参数验证器
 */
const Joi = require('joi');
const { createValidator } = require('./voiceValidator');

/**
 * 菜谱推荐请求验证
 */
const recommendRecipeSchema = Joi.object({
  userId: Joi.string()
    .required()
    .max(64)
    .messages({
      'any.required': '缺少用户ID'
    }),
  sessionId: Joi.string()
    .required()
    .max(64)
    .messages({
      'any.required': '缺少会话ID'
    }),
  count: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(3)
    .messages({
      'number.min': '推荐数量至少为1',
      'number.max': '推荐数量最多为10'
    }),
  preferences: Joi.object({
    cuisineType: Joi.string().max(50).optional(),
    difficulty: Joi.string().valid('easy', 'medium', 'hard').optional(),
    maxCookingTime: Joi.number().integer().positive().optional()
  }).optional()
});

/**
 * "换一批"推荐请求验证
 */
const refreshRecipeSchema = Joi.object({
  userId: Joi.string()
    .required()
    .max(64)
    .messages({
      'any.required': '缺少用户ID'
    }),
  sessionId: Joi.string()
    .required()
    .max(64)
    .messages({
      'any.required': '缺少会话ID'
    }),
  excludeIds: Joi.array()
    .items(Joi.number().integer().positive())
    .default([])
    .messages({
      'array.includes': '排除的菜谱ID格式无效'
    }),
  count: Joi.number()
    .integer()
    .min(1)
    .max(10)
    .default(3)
});

/**
 * 菜谱详情请求验证
 */
const recipeDetailSchema = Joi.object({
  recipeId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'any.required': '缺少菜谱ID',
      'number.positive': '菜谱ID无效'
    }),
  userId: Joi.string()
    .max(64)
    .optional()
});

/**
 * 菜谱列表查询验证
 */
const recipeListSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(10),
  cuisineType: Joi.string()
    .max(50)
    .optional(),
  difficulty: Joi.string()
    .valid('easy', 'medium', 'hard')
    .optional()
});

/**
 * 菜谱创建验证
 */
const createRecipeSchema = Joi.object({
  dishName: Joi.string()
    .required()
    .min(1)
    .max(100)
    .messages({
      'any.required': '缺少菜名',
      'string.max': '菜名过长'
    }),
  normalizedDishName: Joi.string()
    .max(100)
    .optional(),
  ingredients: Joi.array()
    .required()
    .min(1)
    .items(
      Joi.object({
        name: Joi.string().required().max(50),
        amount: Joi.string().max(50).optional(),
        unit: Joi.string().max(20).optional()
      })
    )
    .messages({
      'any.required': '缺少食材列表',
      'array.min': '至少需要一种食材'
    }),
  steps: Joi.array()
    .required()
    .min(1)
    .items(Joi.string().max(500))
    .messages({
      'any.required': '缺少制作步骤',
      'array.min': '至少需要一个步骤'
    }),
  cookingTime: Joi.number()
    .integer()
    .positive()
    .max(480) // 最长8小时
    .optional(),
  difficulty: Joi.string()
    .valid('easy', 'medium', 'hard')
    .default('medium'),
  cuisineType: Joi.string()
    .max(50)
    .optional(),
  tips: Joi.string()
    .max(1000)
    .optional()
});

/**
 * 收藏操作验证
 */
const favoriteSchema = Joi.object({
  userId: Joi.string()
    .required()
    .max(64)
    .messages({
      'any.required': '缺少用户ID'
    }),
  recipeId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'any.required': '缺少菜谱ID',
      'number.positive': '菜谱ID无效'
    })
});

/**
 * 收藏列表查询验证
 */
const favoriteListSchema = Joi.object({
  userId: Joi.string()
    .required()
    .max(64)
    .messages({
      'any.required': '缺少用户ID'
    }),
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(10)
});

module.exports = {
  recommendRecipeSchema,
  refreshRecipeSchema,
  recipeDetailSchema,
  recipeListSchema,
  createRecipeSchema,
  favoriteSchema,
  favoriteListSchema,
  validateRecommendRecipe: createValidator(recommendRecipeSchema),
  validateRefreshRecipe: createValidator(refreshRecipeSchema),
  validateRecipeDetail: createValidator(recipeDetailSchema, 'params'),
  validateRecipeList: createValidator(recipeListSchema, 'query'),
  validateCreateRecipe: createValidator(createRecipeSchema),
  validateFavorite: createValidator(favoriteSchema),
  validateFavoriteList: createValidator(favoriteListSchema, 'query')
};
