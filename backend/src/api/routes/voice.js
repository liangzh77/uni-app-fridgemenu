/**
 * 语音相关API路由
 * 处理语音文本解析、语音识别
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseVoiceText, suggestIngredients } = require('../../services/voiceService');
const { recognizeSpeech, checkConfig } = require('../../services/speechService');
const { Ingredient, FoodSynonymMapping } = require('../../models');
const logger = require('../../config/logger');

// 配置 multer 用于音频文件上传
const uploadDir = path.join(__dirname, '../../../uploads/audio');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `voice-${uniqueSuffix}${path.extname(file.originalname) || '.mp3'}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 最大 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/pcm', 'audio/amr'];
    // 微信小程序上传的音频可能没有正确的 mimetype
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|pcm|amr)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的音频格式，请使用 mp3、wav、pcm 或 amr 格式'));
    }
  }
});

/**
 * POST /api/voice/parse
 * 解析语音文本，提取食材
 */
router.post('/parse', async (req, res, next) => {
  try {
    const { text, userId, sessionId, autoAdd } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: '语音文本不能为空'
      });
    }

    // 解析食材
    const ingredients = await parseVoiceText(text);

    logger.info(`用户 ${userId} 语音解析: "${text}" -> ${ingredients.length} 个食材`);

    // 如果设置了自动添加
    if (autoAdd && userId && sessionId && ingredients.length > 0) {
      const result = await Ingredient.bulkCreateWithDedup(
        userId,
        sessionId,
        ingredients
      );

      return res.json({
        success: true,
        data: {
          ingredients,
          created: result.created,
          skipped: result.skipped,
          autoAdded: true
        },
        message: `识别到 ${ingredients.length} 个食材，已添加 ${result.created.length} 个`
      });
    }

    res.json({
      success: true,
      data: {
        ingredients,
        originalText: text
      },
      message: `识别到 ${ingredients.length} 个食材`
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/voice/normalize
 * 规范化食材名称
 */
router.post('/normalize', async (req, res, next) => {
  try {
    const { ingredients } = req.body;

    if (!ingredients || !Array.isArray(ingredients)) {
      return res.status(400).json({
        success: false,
        message: '食材列表格式错误'
      });
    }

    const normalized = await FoodSynonymMapping.normalizeAll(ingredients);

    res.json({
      success: true,
      data: normalized
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/voice/suggest
 * 根据已有食材推荐补充食材
 */
router.get('/suggest', async (req, res, next) => {
  try {
    const { ingredients } = req.query;

    if (!ingredients) {
      return res.status(400).json({
        success: false,
        message: '缺少食材列表'
      });
    }

    const ingredientList = ingredients.split(',').map(i => i.trim());
    const suggestions = await suggestIngredients(ingredientList);

    res.json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/voice/synonyms/:name
 * 获取食材的同义词
 */
router.get('/synonyms/:name', async (req, res, next) => {
  try {
    const { name } = req.params;

    // 先规范化名称
    const normalized = await FoodSynonymMapping.normalize(name);

    // 获取同义词列表
    const synonyms = await FoodSynonymMapping.getSynonyms(normalized.standardName);

    res.json({
      success: true,
      data: {
        standardName: normalized.standardName,
        category: normalized.category,
        synonyms
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/voice/recognize
 * 上传音频文件进行语音识别，并解析食材
 */
router.post('/recognize', upload.single('audio'), async (req, res, next) => {
  let filePath = null;

  try {
    // 检查配置
    const configStatus = checkConfig();
    if (!configStatus.ready) {
      return res.status(500).json({
        success: false,
        message: '语音识别服务未配置',
        errors: configStatus.issues
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传音频文件'
      });
    }

    filePath = req.file.path;
    const { userId, sessionId, autoAdd } = req.body;

    // 获取音频格式
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '') || 'mp3';
    const formatMap = {
      'mp3': 'mp3',
      'wav': 'wav',
      'pcm': 'pcm',
      'amr': 'amr'
    };
    const format = formatMap[ext] || 'mp3';

    logger.info(`收到语音识别请求，文件: ${req.file.filename}, 格式: ${format}`);

    // 1. 语音识别
    const recognizedText = await recognizeSpeech(filePath, {
      format,
      sampleRate: 16000
    });

    if (!recognizedText || !recognizedText.trim()) {
      return res.json({
        success: true,
        data: {
          text: '',
          ingredients: []
        },
        message: '未识别到语音内容'
      });
    }

    // 2. 解析食材
    const ingredients = await parseVoiceText(recognizedText);

    logger.info(`用户 ${userId} 语音识别: "${recognizedText}" -> ${ingredients.length} 个食材`);

    // 3. 如果设置了自动添加
    if (autoAdd === 'true' && userId && sessionId && ingredients.length > 0) {
      const result = await Ingredient.bulkCreateWithDedup(
        userId,
        sessionId,
        ingredients
      );

      return res.json({
        success: true,
        data: {
          text: recognizedText,
          ingredients,
          created: result.created,
          skipped: result.skipped,
          autoAdded: true
        },
        message: `识别到 ${ingredients.length} 个食材，已添加 ${result.created.length} 个`
      });
    }

    res.json({
      success: true,
      data: {
        text: recognizedText,
        ingredients
      },
      message: `识别到 ${ingredients.length} 个食材`
    });
  } catch (error) {
    logger.error('语音识别失败:', error);
    next(error);
  } finally {
    // 清理临时文件
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) logger.warn('清理临时音频文件失败:', err);
      });
    }
  }
});

/**
 * GET /api/voice/config-status
 * 检查语音识别服务配置状态
 */
router.get('/config-status', (req, res) => {
  const status = checkConfig();
  res.json({
    success: true,
    data: status
  });
});

module.exports = router;
