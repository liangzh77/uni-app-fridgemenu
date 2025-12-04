/**
 * 阿里云服务配置
 * 包括通义千问、通义万相、OSS等服务
 */
const logger = require('./logger');

// 阿里云基础配置
const aliyunConfig = {
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  region: process.env.ALIYUN_REGION || 'cn-shanghai'
};

// DashScope API配置 (通义千问、通义万相)
const dashscopeConfig = {
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
  // 通义千问模型
  qwenModel: 'qwen-turbo',
  // 通义万相模型
  wanxiangModel: 'wanx-v1'
};

// OSS配置
const ossConfig = {
  bucket: process.env.OSS_BUCKET,
  endpoint: process.env.OSS_ENDPOINT || 'oss-cn-shanghai.aliyuncs.com',
  region: process.env.ALIYUN_REGION || 'cn-shanghai',
  // 临时URL有效期 (24小时)
  tempUrlExpiration: 24 * 60 * 60
};

// 自有CDN配置
const cdnConfig = {
  bucket: process.env.CDN_BUCKET,
  domain: process.env.CDN_DOMAIN,
  // 图片存储路径前缀
  imagePrefix: 'recipe-images/'
};

/**
 * 验证阿里云配置是否完整
 */
function validateConfig() {
  const required = ['ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET', 'DASHSCOPE_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.warn(`阿里云配置缺失: ${missing.join(', ')}`);
    return false;
  }
  return true;
}

module.exports = {
  aliyunConfig,
  dashscopeConfig,
  ossConfig,
  cdnConfig,
  validateConfig
};
