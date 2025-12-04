/**
 * 语音相关参数验证器
 */
const Joi = require('joi');

/**
 * 语音文本解析请求验证
 */
const parseVoiceTextSchema = Joi.object({
  text: Joi.string()
    .required()
    .min(1)
    .max(500)
    .messages({
      'string.empty': '语音文本不能为空',
      'string.min': '语音文本不能为空',
      'string.max': '语音文本过长，请分多次输入',
      'any.required': '缺少语音文本参数'
    }),
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
    })
});

/**
 * 食材添加请求验证
 */
const addIngredientsSchema = Joi.object({
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
  ingredients: Joi.array()
    .required()
    .min(1)
    .max(50)
    .items(
      Joi.alternatives().try(
        Joi.string().min(1).max(50),
        Joi.object({
          name: Joi.string().required().min(1).max(50),
          category: Joi.string().max(50).optional(),
          quantity: Joi.number().positive().optional(),
          unit: Joi.string().max(20).optional()
        })
      )
    )
    .messages({
      'array.min': '至少需要添加一个食材',
      'array.max': '一次最多添加50个食材',
      'any.required': '缺少食材列表'
    })
});

/**
 * 食材删除请求验证
 */
const deleteIngredientSchema = Joi.object({
  userId: Joi.string()
    .required()
    .messages({
      'any.required': '缺少用户ID'
    }),
  ingredientId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'any.required': '缺少食材ID',
      'number.positive': '食材ID无效'
    })
});

/**
 * 创建验证中间件
 * @param {Joi.Schema} schema - Joi验证schema
 * @param {string} source - 验证数据来源: 'body', 'query', 'params'
 */
function createValidator(schema, source = 'body') {
  return (req, res, next) => {
    const data = source === 'body' ? req.body :
                 source === 'query' ? req.query :
                 source === 'params' ? req.params : req.body;

    const { error, value } = schema.validate(data, {
      abortEarly: false, // 返回所有错误
      stripUnknown: true // 移除未知字段
    });

    if (error) {
      const messages = error.details.map(detail => detail.message);
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: messages[0],
        errors: messages
      });
    }

    // 将验证后的数据替换原数据
    if (source === 'body') req.body = value;
    else if (source === 'query') req.query = value;
    else if (source === 'params') req.params = value;

    next();
  };
}

module.exports = {
  parseVoiceTextSchema,
  addIngredientsSchema,
  deleteIngredientSchema,
  validateParseVoiceText: createValidator(parseVoiceTextSchema),
  validateAddIngredients: createValidator(addIngredientsSchema),
  validateDeleteIngredient: createValidator(deleteIngredientSchema, 'query'),
  createValidator
};
