/**
 * 微信小程序配置
 * 包括登录授权、语音识别等
 */
const axios = require('axios');
const logger = require('./logger');

// 微信小程序配置
const wechatConfig = {
  appId: process.env.WECHAT_APPID,
  appSecret: process.env.WECHAT_SECRET,
  // 微信API基础URL
  apiBaseUrl: 'https://api.weixin.qq.com'
};

/**
 * 通过code获取用户openid和session_key
 * @param {string} code - 微信登录code
 * @returns {Promise<{openid: string, session_key: string}>}
 */
async function code2Session(code) {
  try {
    const url = `${wechatConfig.apiBaseUrl}/sns/jscode2session`;
    const response = await axios.get(url, {
      params: {
        appid: wechatConfig.appId,
        secret: wechatConfig.appSecret,
        js_code: code,
        grant_type: 'authorization_code'
      }
    });

    const data = response.data;

    if (data.errcode) {
      logger.error(`微信登录失败: ${data.errcode} - ${data.errmsg}`);
      throw new Error(`微信登录失败: ${data.errmsg}`);
    }

    return {
      openid: data.openid,
      sessionKey: data.session_key,
      unionid: data.unionid
    };
  } catch (error) {
    logger.error('code2Session错误:', error);
    throw error;
  }
}

/**
 * 获取微信接口调用凭证access_token
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  try {
    const url = `${wechatConfig.apiBaseUrl}/cgi-bin/token`;
    const response = await axios.get(url, {
      params: {
        grant_type: 'client_credential',
        appid: wechatConfig.appId,
        secret: wechatConfig.appSecret
      }
    });

    const data = response.data;

    if (data.errcode) {
      logger.error(`获取access_token失败: ${data.errcode} - ${data.errmsg}`);
      throw new Error(`获取access_token失败: ${data.errmsg}`);
    }

    return data.access_token;
  } catch (error) {
    logger.error('getAccessToken错误:', error);
    throw error;
  }
}

/**
 * 验证配置是否完整且有效
 */
function validateConfig() {
  const required = ['WECHAT_APPID', 'WECHAT_SECRET'];
  const placeholders = ['your_', 'YOUR_', 'xxx', 'placeholder'];

  // 检查配置是否存在且不是占位符
  const invalid = required.filter(key => {
    const value = process.env[key];
    if (!value) return true;
    // 检查是否为占位符值
    return placeholders.some(p => value.toLowerCase().includes(p.toLowerCase()));
  });

  if (invalid.length > 0) {
    logger.warn(`微信配置无效或缺失: ${invalid.join(', ')}`);
    return false;
  }
  return true;
}

module.exports = {
  wechatConfig,
  code2Session,
  getAccessToken,
  validateConfig
};
