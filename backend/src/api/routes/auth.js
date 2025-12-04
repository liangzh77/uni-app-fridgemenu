/**
 * 认证相关API路由
 * 处理微信登录等认证操作
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { code2Session } = require('../../config/wechat');
const logger = require('../../config/logger');

/**
 * POST /api/auth/wechat-login
 * 微信小程序登录
 */
router.post('/wechat-login', async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: code'
      });
    }

    // 调用微信接口获取openid和session_key
    const wxSession = await code2Session(code);

    // 生成自定义登录态（sessionId）
    const sessionId = crypto.randomUUID();

    // TODO: 可以将sessionId与openid的映射存储到Redis
    // 这里简化处理，直接返回

    logger.info(`微信登录成功: openid=${wxSession.openid.substring(0, 8)}...`);

    res.json({
      success: true,
      data: {
        userId: wxSession.openid,
        sessionId,
        // 不返回session_key给前端（安全考虑）
      },
      message: '登录成功'
    });
  } catch (error) {
    logger.error('微信登录失败:', error);

    // 判断是否为微信接口错误
    if (error.message.includes('微信登录失败')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    next(error);
  }
});

/**
 * POST /api/auth/refresh-session
 * 刷新会话
 */
router.post('/refresh-session', async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数: userId'
      });
    }

    // 生成新的sessionId
    const sessionId = crypto.randomUUID();

    res.json({
      success: true,
      data: {
        userId,
        sessionId
      },
      message: '会话已刷新'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/check
 * 检查登录状态
 */
router.get('/check', async (req, res, next) => {
  try {
    const { userId, sessionId } = req.query;

    if (!userId || !sessionId) {
      return res.json({
        success: true,
        data: {
          isLoggedIn: false
        }
      });
    }

    // TODO: 验证sessionId是否有效（需要与Redis中的记录比对）
    // 这里简化处理，假设有userId和sessionId就是已登录

    res.json({
      success: true,
      data: {
        isLoggedIn: true,
        userId
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
