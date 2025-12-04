/**
 * 数据库配置
 * Sequelize ORM连接配置
 */
const { Sequelize } = require('sequelize');
const logger = require('./logger');

// 创建Sequelize实例
const sequelize = new Sequelize(
  process.env.DB_NAME || 'fridge_menu_db',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true, // 使用下划线命名
      freezeTableName: true // 禁止表名复数化
    },
    timezone: '+08:00' // 中国时区
  }
);

/**
 * 测试数据库连接
 */
async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info('数据库连接成功');
    return true;
  } catch (error) {
    logger.error('数据库连接失败:', error);
    return false;
  }
}

/**
 * 同步数据库模型
 * @param {boolean} force - 是否强制重建表
 */
async function syncDatabase(force = false) {
  try {
    await sequelize.sync({ force });
    logger.info(`数据库同步完成${force ? '(强制重建)' : ''}`);
  } catch (error) {
    logger.error('数据库同步失败:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  testConnection,
  syncDatabase
};
