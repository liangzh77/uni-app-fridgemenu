/**
 * 清空推荐缓存脚本
 * 运行方式: node scripts/clearCache.js
 */
require('dotenv').config();
const { sequelize } = require('../src/config/database');
const { RecommendationCache } = require('../src/models');

async function clearCache() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    const count = await RecommendationCache.count();
    console.log(`当前缓存记录数: ${count}`);

    if (count > 0) {
      await RecommendationCache.destroy({ where: {}, truncate: true });
      console.log('已清空所有推荐缓存');
    } else {
      console.log('缓存已为空，无需清理');
    }

    process.exit(0);
  } catch (error) {
    console.error('清理缓存失败:', error.message);
    process.exit(1);
  }
}

clearCache();
