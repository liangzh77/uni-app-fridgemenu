/**
 * 认证相关API路由
 * 处理微信登录等认证操作
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { code2Session, validateConfig } = require('../../config/wechat');
const logger = require('../../config/logger');

// 内存存储用户数据（开发环境）
const users = new Map();

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

    let userId;
    const sessionId = crypto.randomUUID();

    // 检查微信配置是否完整
    if (validateConfig()) {
      // 调用微信接口获取openid和session_key
      const wxSession = await code2Session(code);
      userId = wxSession.openid;
      logger.info(`微信登录成功: openid=${wxSession.openid.substring(0, 8)}...`);
    } else {
      // 微信配置缺失，使用开发模式：生成本地用户ID
      userId = `wx_dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      logger.warn(`微信配置缺失，使用开发模式登录: ${userId}`);
    }

    res.json({
      success: true,
      data: {
        userId,
        sessionId,
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

/**
 * POST /api/auth/register
 * 用户名密码注册
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        message: '用户名至少3个字符'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码至少6个字符'
      });
    }

    // 检查用户名是否已存在
    if (users.has(username)) {
      return res.status(400).json({
        success: false,
        message: '用户名已存在'
      });
    }

    // 创建用户
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionId = crypto.randomUUID();
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    users.set(username, {
      userId,
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    });

    logger.info(`用户注册成功: ${username}`);

    res.json({
      success: true,
      data: {
        userId,
        sessionId,
        username
      },
      message: '注册成功'
    });
  } catch (error) {
    logger.error('注册失败:', error);
    next(error);
  }
});

/**
 * POST /api/auth/login
 * 用户名密码登录
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    // 查找用户
    const user = users.get(username);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 验证密码
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password !== hashedPassword) {
      return res.status(400).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 生成新的sessionId
    const sessionId = crypto.randomUUID();

    logger.info(`用户登录成功: ${username}`);

    res.json({
      success: true,
      data: {
        userId: user.userId,
        sessionId,
        username: user.username
      },
      message: '登录成功'
    });
  } catch (error) {
    logger.error('登录失败:', error);
    next(error);
  }
});

module.exports = router;
