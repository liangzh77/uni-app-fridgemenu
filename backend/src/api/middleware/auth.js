/**
 * 微信授权中间件
 * 验证用户登录状态
 */
const logger = require('../../config/logger');

/**
 * 验证用户登录状态
 * 从请求头或查询参数中提取用户信息
 */
function authMiddleware(req, res, next) {
  // 从请求头获取用户信息
  const userId = req.headers['x-user-id'] || req.query.userId || req.body?.userId;
  const sessionId = req.headers['x-session-id'] || req.query.sessionId || req.body?.sessionId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: '用户未登录，请先授权'
    });
  }

  // 将用户信息附加到请求对象
  req.user = {
    userId,
    sessionId
  };

  next();
}

/**
 * 可选的认证中间件
 * 不强制要求登录，但如果提供了用户信息则解析
 */
function optionalAuthMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'] || req.query.userId || req.body?.userId;
  const sessionId = req.headers['x-session-id'] || req.query.sessionId || req.body?.sessionId;

  if (userId) {
    req.user = {
      userId,
      sessionId
    };
  }

  next();
}

/**
 * 验证session有效性（可扩展为Redis验证）
 * @param {string} userId - 用户ID
 * @param {string} sessionId - 会话ID
 * @returns {Promise<boolean>}
 */
async function validateSession(userId, sessionId) {
  // TODO: 实现Redis session验证
  // const stored = await redis.get(`session:${userId}`);
  // return stored === sessionId;

  // 简化实现：只要有userId和sessionId就认为有效
  return !!(userId && sessionId);
}

/**
 * 带session验证的认证中间件
 */
async function strictAuthMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'] || req.query.userId || req.body?.userId;
  const sessionId = req.headers['x-session-id'] || req.query.sessionId || req.body?.sessionId;

  if (!userId || !sessionId) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: '用户未登录，请先授权'
    });
  }

  try {
    const isValid = await validateSession(userId, sessionId);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        code: 'SESSION_EXPIRED',
        message: '会话已过期，请重新登录'
      });
    }

    req.user = {
      userId,
      sessionId
    };

    next();
  } catch (error) {
    logger.error('认证验证错误:', error);
    next(error);
  }
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  strictAuthMiddleware,
  validateSession
};
