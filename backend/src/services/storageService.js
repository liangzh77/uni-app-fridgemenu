/**
 * 云存储服务
 * 处理图片上传、转存、URL管理等
 */
const OSS = require('ali-oss');
const sharp = require('sharp');
const crypto = require('crypto');
const logger = require('../config/logger');
const { aliyunConfig, ossConfig, cdnConfig } = require('../config/aliyun');

// OSS客户端实例
let ossClient = null;

/**
 * 获取OSS客户端实例
 */
function getOssClient() {
  if (!ossClient) {
    ossClient = new OSS({
      region: ossConfig.region,
      accessKeyId: aliyunConfig.accessKeyId,
      accessKeySecret: aliyunConfig.accessKeySecret,
      bucket: ossConfig.bucket
    });
  }
  return ossClient;
}

/**
 * 计算图片内容的MD5哈希
 * @param {Buffer} imageBuffer - 图片Buffer
 * @returns {string} MD5哈希值
 */
function calculateImageHash(imageBuffer) {
  return crypto.createHash('md5').update(imageBuffer).digest('hex');
}

/**
 * 将PNG图片转换为JPG格式
 * @param {Buffer} pngBuffer - PNG图片Buffer
 * @param {number} quality - JPG质量 (1-100)
 * @returns {Promise<Buffer>} JPG图片Buffer
 */
async function convertPngToJpg(pngBuffer, quality = 80) {
  try {
    const jpgBuffer = await sharp(pngBuffer)
      .jpeg({ quality })
      .toBuffer();

    logger.info(`图片转换完成: PNG ${pngBuffer.length} bytes -> JPG ${jpgBuffer.length} bytes`);
    return jpgBuffer;
  } catch (error) {
    logger.error('PNG转JPG失败:', error);
    throw error;
  }
}

/**
 * 压缩图片到指定大小
 * @param {Buffer} imageBuffer - 图片Buffer
 * @param {number} maxSizeKb - 最大大小(KB)
 * @returns {Promise<Buffer>} 压缩后的图片Buffer
 */
async function compressImage(imageBuffer, maxSizeKb = 200) {
  const maxBytes = maxSizeKb * 1024;

  if (imageBuffer.length <= maxBytes) {
    return imageBuffer;
  }

  let quality = 80;
  let compressed = imageBuffer;

  while (compressed.length > maxBytes && quality > 20) {
    compressed = await sharp(imageBuffer)
      .jpeg({ quality })
      .toBuffer();
    quality -= 10;
  }

  logger.info(`图片压缩完成: ${imageBuffer.length} -> ${compressed.length} bytes`);
  return compressed;
}

/**
 * 上传图片到OSS
 * @param {Buffer} imageBuffer - 图片Buffer
 * @param {string} fileName - 文件名
 * @returns {Promise<{url: string, hash: string, sizeKb: number}>}
 */
async function uploadToOss(imageBuffer, fileName) {
  try {
    const client = getOssClient();
    const objectKey = `${cdnConfig.imagePrefix}${fileName}`;

    const result = await client.put(objectKey, imageBuffer, {
      headers: {
        'Content-Type': 'image/jpeg'
      }
    });

    const hash = calculateImageHash(imageBuffer);
    const sizeKb = Math.ceil(imageBuffer.length / 1024);

    logger.info(`图片上传成功: ${objectKey}, 大小: ${sizeKb}KB`);

    return {
      url: result.url,
      objectKey,
      hash,
      sizeKb
    };
  } catch (error) {
    logger.error('OSS上传失败:', error);
    throw error;
  }
}

/**
 * 从临时URL下载图片并转存到自有CDN
 * @param {string} tempUrl - 临时图片URL (通义万相生成)
 * @param {string} normalizedDishName - 规范化菜名
 * @param {string} recipeHash - 菜谱哈希值
 * @returns {Promise<{permanentUrl: string, hash: string, sizeKb: number}>}
 */
async function transferToCdn(tempUrl, normalizedDishName, recipeHash) {
  try {
    const axios = require('axios');

    // 下载临时图片
    const response = await axios.get(tempUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    let imageBuffer = Buffer.from(response.data);

    // 检测图片格式，如果是PNG则转换为JPG
    const isPng = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50;
    if (isPng) {
      imageBuffer = await convertPngToJpg(imageBuffer, 80);
    }

    // 压缩图片
    imageBuffer = await compressImage(imageBuffer, 200);

    // 生成文件名: 规范化菜名_哈希前8位_时间戳.jpg
    const timestamp = Date.now();
    const shortHash = recipeHash.substring(0, 8);
    const safeDishName = normalizedDishName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const fileName = `${safeDishName}_${shortHash}_${timestamp}.jpg`;

    // 上传到OSS
    const uploadResult = await uploadToOss(imageBuffer, fileName);

    // 构建CDN URL
    const cdnUrl = cdnConfig.domain
      ? `https://${cdnConfig.domain}/${uploadResult.objectKey}`
      : uploadResult.url;

    return {
      permanentUrl: cdnUrl,
      objectKey: uploadResult.objectKey,
      hash: uploadResult.hash,
      sizeKb: uploadResult.sizeKb
    };
  } catch (error) {
    logger.error('图片转存失败:', error);
    throw error;
  }
}

/**
 * 生成OSS临时访问URL
 * @param {string} objectKey - OSS对象键
 * @param {number} expiresSeconds - 过期时间(秒)
 * @returns {Promise<string>} 临时访问URL
 */
async function generateTempUrl(objectKey, expiresSeconds = 3600) {
  try {
    const client = getOssClient();
    const url = client.signatureUrl(objectKey, {
      expires: expiresSeconds
    });
    return url;
  } catch (error) {
    logger.error('生成临时URL失败:', error);
    throw error;
  }
}

/**
 * 删除OSS对象
 * @param {string} objectKey - OSS对象键
 */
async function deleteFromOss(objectKey) {
  try {
    const client = getOssClient();
    await client.delete(objectKey);
    logger.info(`删除OSS对象成功: ${objectKey}`);
  } catch (error) {
    logger.error('删除OSS对象失败:', error);
    throw error;
  }
}

/**
 * 从CDN URL中提取objectKey并删除
 * @param {string} cdnUrl - CDN URL
 */
async function deleteFromCDN(cdnUrl) {
  try {
    if (!cdnUrl) return;

    // 从URL中提取objectKey
    let objectKey;

    if (cdnConfig.domain && cdnUrl.includes(cdnConfig.domain)) {
      // CDN URL格式: https://cdn.example.com/images/xxx.jpg
      const urlObj = new URL(cdnUrl);
      objectKey = urlObj.pathname.slice(1); // 移除开头的 /
    } else if (cdnUrl.includes('.aliyuncs.com')) {
      // OSS URL格式: https://bucket.oss-region.aliyuncs.com/images/xxx.jpg
      const urlObj = new URL(cdnUrl);
      objectKey = urlObj.pathname.slice(1);
    } else {
      // 假设是objectKey
      objectKey = cdnUrl;
    }

    await deleteFromOss(objectKey);
    logger.info(`从CDN删除图片成功: ${objectKey}`);
  } catch (error) {
    logger.error('从CDN删除图片失败:', error);
    // 不抛出异常，允许继续执行
  }
}

/**
 * 验证存储配置是否完整
 */
function validateStorageConfig() {
  const required = ['OSS_BUCKET', 'ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.warn(`存储配置缺失: ${missing.join(', ')}`);
    return false;
  }
  return true;
}

module.exports = {
  getOssClient,
  calculateImageHash,
  convertPngToJpg,
  compressImage,
  uploadToOss,
  transferToCdn,
  generateTempUrl,
  deleteFromOss,
  deleteFromCDN,
  validateStorageConfig
};
