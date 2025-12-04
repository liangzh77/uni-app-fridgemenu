/**
 * 限流中间件
 * 防止API滥用和刷量攻击
 */
const rateLimit = require('express-rate-limit');
const logger = require('../../config/logger');

/**
 * 基础限流配置
 * 适用于一般API接口
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 60, // 每分钟最多60次请求
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: '请求过于频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // 优先使用用户ID，否则使用IP
    return req.headers['x-user-id'] || req.ip;
  },
  handler: (req, res, next, options) => {
    logger.warn(`限流触发: ${req.headers['x-user-id'] || req.ip} - ${req.path}`);
    res.status(429).json(options.message);
  }
});

/**
 * AI接口限流配置
 * 更严格的限制，防止刷量
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 10, // 每分钟最多10次AI请求
  message: {
    success: false,
    code: 'AI_RATE_LIMIT_EXCEEDED',
    message: 'AI推荐请求过于频繁，请等待1分钟后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-user-id'] || req.ip;
  },
  handler: (req, res, next, options) => {
    logger.warn(`AI限流触发: ${req.headers['x-user-id'] || req.ip} - ${req.path}`);
    res.status(429).json(options.message);
  }
});

/**
 * 图片生成限流配置
 * 最严格的限制，通义万相API成本较高
 */
const imageGenerationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 5, // 每分钟最多5次图片生成请求
  message: {
    success: false,
    code: 'IMAGE_RATE_LIMIT_EXCEEDED',
    message: '图片生成请求过于频繁，请等待后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-user-id'] || req.ip;
  },
  handler: (req, res, next, options) => {
    logger.warn(`图片生成限流触发: ${req.headers['x-user-id'] || req.ip}`);
    res.status(429).json(options.message);
  }
});

/**
 * 登录接口限流配置
 * 防止暴力破解
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟窗口
  max: 10, // 每15分钟最多10次登录尝试
  message: {
    success: false,
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: '登录尝试次数过多，请15分钟后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip;
  },
  handler: (req, res, next, options) => {
    logger.warn(`登录限流触发: ${req.ip}`);
    res.status(429).json(options.message);
  }
});

/**
 * 收藏操作限流
 * 防止恶意刷收藏
 */
const favoriteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 30, // 每分钟最多30次收藏操作
  message: {
    success: false,
    code: 'FAVORITE_RATE_LIMIT_EXCEEDED',
    message: '操作过于频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-user-id'] || req.ip;
  }
});

module.exports = {
  generalLimiter,
  aiLimiter,
  imageGenerationLimiter,
  authLimiter,
  favoriteLimiter
};
