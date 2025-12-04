/**
 * 阿里云语音识别服务
 * 使用一句话识别 RESTful API
 */
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const logger = require('../config/logger');
const { aliyunConfig } = require('../config/aliyun');

// 阿里云语音识别配置
const NLS_CONFIG = {
  appKey: process.env.ALIYUN_NLS_APP_KEY,
  // 一句话识别 RESTful API 地址
  apiUrl: 'https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr'
};

/**
 * 生成阿里云 POP API 签名
 */
function generateSignature(params, accessKeySecret) {
  // 1. 按参数名排序
  const sortedKeys = Object.keys(params).sort();

  // 2. 构建规范化请求字符串
  const canonicalizedQueryString = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  // 3. 构建待签名字符串
  const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonicalizedQueryString)}`;

  // 4. 计算签名
  const signature = crypto
    .createHmac('sha1', accessKeySecret + '&')
    .update(stringToSign)
    .digest('base64');

  return signature;
}

/**
 * 获取阿里云语音识别 Token
 */
async function getAccessToken() {
  const accessKeyId = aliyunConfig.accessKeyId;
  const accessKeySecret = aliyunConfig.accessKeySecret;

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('阿里云 AccessKey 未配置');
  }

  // 构建请求参数
  const params = {
    AccessKeyId: accessKeyId,
    Action: 'CreateToken',
    Format: 'JSON',
    RegionId: 'cn-shanghai',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2019-02-28'
  };

  // 生成签名
  const signature = generateSignature(params, accessKeySecret);
  params.Signature = signature;

  try {
    const response = await axios.get('https://nls-meta.cn-shanghai.aliyuncs.com/', {
      params,
      timeout: 10000
    });

    logger.info('Token 响应:', JSON.stringify(response.data));

    if (response.data && response.data.Token && response.data.Token.Id) {
      logger.info('成功获取阿里云 Token');
      return response.data.Token.Id;
    }

    throw new Error(response.data?.Message || '获取 Token 失败');
  } catch (error) {
    if (error.response) {
      logger.error('获取阿里云 Token 失败，响应:', JSON.stringify(error.response.data));
    }
    logger.error('获取阿里云 Token 失败:', error.message);
    throw error;
  }
}

// Token 缓存
let tokenCache = {
  token: null,
  expireTime: 0
};

/**
 * 获取缓存的 Token（Token 有效期 24 小时，我们缓存 23 小时）
 */
async function getCachedToken() {
  const now = Date.now();

  // Token 还有效
  if (tokenCache.token && tokenCache.expireTime > now) {
    return tokenCache.token;
  }

  // 重新获取 Token
  const token = await getAccessToken();
  tokenCache = {
    token,
    expireTime: now + 23 * 60 * 60 * 1000 // 23 小时后过期
  };

  return token;
}

/**
 * 语音识别 - 一句话识别
 * @param {Buffer|string} audioData - 音频数据 (Buffer) 或文件路径
 * @param {Object} options - 配置选项
 * @param {string} options.format - 音频格式，默认 'mp3'
 * @param {number} options.sampleRate - 采样率，默认 16000
 * @returns {Promise<string>} 识别结果文本
 */
async function recognizeSpeech(audioData, options = {}) {
  const {
    format = 'mp3',
    sampleRate = 16000
  } = options;

  if (!NLS_CONFIG.appKey) {
    throw new Error('阿里云语音识别 AppKey 未配置，请设置 ALIYUN_NLS_APP_KEY 环境变量');
  }

  // 如果是文件路径，读取文件内容
  let audioBuffer;
  if (typeof audioData === 'string') {
    audioBuffer = fs.readFileSync(audioData);
  } else {
    audioBuffer = audioData;
  }

  // 获取 Token
  const token = await getCachedToken();

  // 构建请求 URL
  const url = `${NLS_CONFIG.apiUrl}?appkey=${NLS_CONFIG.appKey}&format=${format}&sample_rate=${sampleRate}&enable_punctuation_prediction=true&enable_inverse_text_normalization=true`;

  try {
    logger.info(`开始语音识别，音频大小: ${audioBuffer.length} bytes, 格式: ${format}, Token: ${token ? token.substring(0, 20) + '...' : 'null'}`);

    const response = await axios.post(url, audioBuffer, {
      headers: {
        'X-NLS-Token': token,
        'Content-Type': 'application/octet-stream',
        'Content-Length': audioBuffer.length
      },
      timeout: 30000, // 30 秒超时
      responseType: 'arraybuffer' // 确保能获取到原始响应数据
    });

    // 将响应转换为 JSON
    const responseText = Buffer.from(response.data).toString('utf-8');
    logger.info(`阿里云响应: ${responseText}`);

    const responseData = JSON.parse(responseText);

    if (responseData && responseData.status === 20000000) {
      const result = responseData.result || '';
      logger.info(`语音识别成功: "${result}"`);
      return result;
    } else {
      const errorMsg = responseData?.message || '识别失败';
      logger.error(`语音识别失败: ${errorMsg}`, responseData);
      throw new Error(errorMsg);
    }
  } catch (error) {
    if (error.response) {
      logger.error(`语音识别请求失败，状态码: ${error.response.status}`);
      // 处理 arraybuffer 响应
      let responseText = '';
      if (error.response.data) {
        if (Buffer.isBuffer(error.response.data)) {
          responseText = error.response.data.toString('utf-8');
        } else if (error.response.data instanceof ArrayBuffer) {
          responseText = Buffer.from(error.response.data).toString('utf-8');
        } else if (typeof error.response.data === 'string') {
          responseText = error.response.data;
        } else {
          responseText = JSON.stringify(error.response.data);
        }
      }
      logger.error(`响应数据: ${responseText}`);

      // 尝试解析错误信息
      let errorMsg = `语音识别服务异常 (${error.response.status})`;
      if (responseText) {
        try {
          const parsed = JSON.parse(responseText);
          errorMsg = parsed.message || parsed.error || errorMsg;
        } catch (e) {
          errorMsg = responseText || errorMsg;
        }
      }
      throw new Error(errorMsg);
    }
    logger.error('语音识别错误:', error.message);
    throw error;
  }
}

/**
 * 检查语音识别服务配置
 */
function checkConfig() {
  const issues = [];

  if (!aliyunConfig.accessKeyId) {
    issues.push('ALIYUN_ACCESS_KEY_ID 未配置');
  }
  if (!aliyunConfig.accessKeySecret) {
    issues.push('ALIYUN_ACCESS_KEY_SECRET 未配置');
  }
  if (!NLS_CONFIG.appKey) {
    issues.push('ALIYUN_NLS_APP_KEY 未配置');
  }

  return {
    ready: issues.length === 0,
    issues
  };
}

module.exports = {
  recognizeSpeech,
  checkConfig,
  getAccessToken,
  getCachedToken
};
