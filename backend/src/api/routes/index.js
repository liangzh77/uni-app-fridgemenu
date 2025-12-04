/**
 * API路由索引
 * 统一注册所有API路由
 */
const express = require('express');
const router = express.Router();

// 导入路由模块
const authRoutes = require('./auth');
const ingredientsRoutes = require('./ingredients');
const recipesRoutes = require('./recipes');
const favoritesRoutes = require('./favorites');
const voiceRoutes = require('./voice');
const recommendRoutes = require('./recommend');
const adminRoutes = require('./admin');

// 注册路由
router.use('/auth', authRoutes);
router.use('/ingredients', ingredientsRoutes);
router.use('/recipes', recipesRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/voice', voiceRoutes);
router.use('/recommend', recommendRoutes);
router.use('/admin', adminRoutes);

// 健康检查端点
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// API版本信息
router.get('/version', (req, res) => {
  res.json({
    success: true,
    data: {
      version: '1.0.0',
      name: 'FridgeMenu API',
      description: 'AI智能菜谱推荐API'
    }
  });
});

module.exports = router;
