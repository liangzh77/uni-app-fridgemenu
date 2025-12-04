/**
 * Redis配置
 * 用于缓存图片查询结果
 */
const Redis = require('ioredis');
const logger = require('./logger');

// 创建Redis客户端
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: 0,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
});

// 连接事件
redis.on('connect', () => {
  logger.info('Redis连接成功');
});

redis.on('error', (err) => {
  logger.error('Redis连接错误:', err);
});

redis.on('close', () => {
  logger.warn('Redis连接关闭');
});

/**
 * 获取缓存
 * @param {string} key - 缓存键
 * @returns {Promise<any|null>} 缓存值或null
 */
async function getCache(key) {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error(`Redis获取缓存失败 [${key}]:`, error);
    return null;
  }
}

/**
 * 设置缓存
 * @param {string} key - 缓存键
 * @param {any} value - 缓存值
 * @param {number} ttl - 过期时间(秒)
 */
async function setCache(key, value, ttl = 3600) {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (error) {
    logger.error(`Redis设置缓存失败 [${key}]:`, error);
  }
}

/**
 * 删除缓存
 * @param {string} key - 缓存键
 */
async function deleteCache(key) {
  try {
    await redis.del(key);
  } catch (error) {
    logger.error(`Redis删除缓存失败 [${key}]:`, error);
  }
}

module.exports = {
  redis,
  getCache,
  setCache,
  deleteCache
};
