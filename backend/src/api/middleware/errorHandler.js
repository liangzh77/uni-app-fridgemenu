/**
 * 全局错误处理中间件
 * 统一处理所有未捕获的错误
 */
const logger = require('../../config/logger');

/**
 * 错误处理中间件
 * @param {Error} err - 错误对象
 * @param {Request} req - Express请求对象
 * @param {Response} res - Express响应对象
 * @param {Function} _next - 下一个中间件
 */
function errorHandler(err, req, res, _next) {
  // 记录错误日志
  logger.error(`${req.method} ${req.path} - ${err.message}`, {
    stack: err.stack,
    body: req.body,
    query: req.query,
    params: req.params
  });

  // 确定状态码
  const statusCode = err.statusCode || err.status || 500;

  // 构建错误响应
  const errorResponse = {
    error: err.name || 'Error',
    message: process.env.NODE_ENV === 'production' && statusCode === 500
      ? '服务器内部错误，请稍后重试'
      : err.message,
    code: err.code || 'INTERNAL_ERROR'
  };

  // 开发环境返回堆栈信息
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;
