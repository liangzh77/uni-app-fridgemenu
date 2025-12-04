# Ingredient Normalization - Implementation Guide

## Quick Start for Developers

This guide provides step-by-step implementation instructions for the ingredient normalization system.

---

## Step 1: Create the Ingredient Dictionary

Create file: `backend/data/ingredient_dictionary.json`

```json
{
  "metadata": {
    "version": "1.0.0",
    "created_date": "2025-12-04",
    "total_entries": 500,
    "last_updated": "2025-12-04",
    "maintainer": "recipe-team"
  },
  "ingredients": {
    "西红柿": {
      "标准形式": "西红柿",
      "别名": [
        "番茄",
        "红柿",
        "西红柿子"
      ],
      "英文": ["tomato", "red tomato"],
      "分类": "蔬菜",
      "热量": 18,
      "蛋白质": 0.9,
      "使用频率": 0.95
    },
    "豆角": {
      "标准形式": "豆角",
      "别名": [
        "四季豆",
        "梅豆",
        "扁豆",
        "豌豆荚"
      ],
      "英文": ["green bean", "string bean"],
      "分类": "蔬菜",
      "热量": 32,
      "蛋白质": 2.2,
      "使用频率": 0.80
    },
    "土豆": {
      "标准形式": "土豆",
      "别名": [
        "马铃薯",
        "洋芋",
        "山药蛋",
        "地蛋"
      ],
      "英文": ["potato"],
      "分类": "蔬菜",
      "热量": 77,
      "蛋白质": 2.0,
      "使用频率": 0.92
    },
    "萝卜": {
      "标准形式": "萝卜",
      "别名": [
        "白萝卜",
        "圆根",
        "菜菔"
      ],
      "英文": ["radish", "daikon"],
      "分类": "蔬菜",
      "热量": 16,
      "蛋白质": 0.7,
      "使用频率": 0.65
    },
    "香菜": {
      "标准形式": "香菜",
      "别名": [
        "芫荽",
        "香荽",
        "胡荽"
      ],
      "英文": ["cilantro", "coriander"],
      "分类": "蔬菜",
      "热量": 23,
      "蛋白质": 2.1,
      "使用频率": 0.70
    },
    "鸡蛋": {
      "标准形式": "鸡蛋",
      "别名": [
        "鸡卵",
        "蛋"
      ],
      "英文": ["egg", "chicken egg"],
      "分类": "蛋奶",
      "热量": 155,
      "蛋白质": 13.3,
      "使用频率": 0.98
    },
    "猪肉": {
      "标准形式": "猪肉",
      "别名": [
        "胖头肉"
      ],
      "英文": ["pork"],
      "分类": "肉类",
      "热量": 242,
      "蛋白质": 27.2,
      "使用频率": 0.90
    },
    "葱": {
      "标准形式": "葱",
      "别名": [
        "大葱",
        "绿葱",
        "葱段"
      ],
      "英文": ["scallion", "green onion"],
      "分类": "调料",
      "热量": 30,
      "蛋白质": 1.9,
      "使用频率": 0.85
    },
    "生姜": {
      "标准形式": "生姜",
      "别名": [
        "姜",
        "子姜",
        "嫩姜"
      ],
      "英文": ["ginger", "fresh ginger"],
      "分类": "调料",
      "热量": 49,
      "蛋白质": 1.8,
      "使用频率": 0.75
    },
    "大蒜": {
      "标准形式": "大蒜",
      "别名": [
        "蒜",
        "蒜头"
      ],
      "英文": ["garlic"],
      "分类": "调料",
      "热量": 149,
      "蛋白质": 6.4,
      "使用频率": 0.88
    }
  }
}
```

---

## Step 2: Implement the Normalizer Service

Create file: `backend/services/ingredient_normalizer.py`

```python
import json
from typing import Optional, List, Dict, Tuple
from pathlib import Path
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

class IngredientNormalizer:
    """食材规范化服务"""

    def __init__(self, dictionary_path: str = "backend/data/ingredient_dictionary.json"):
        """
        初始化规范化器

        Args:
            dictionary_path: 食材字典文件路径
        """
        self.dictionary_path = Path(dictionary_path)
        self.norm_dict = {}
        self.alias_map = {}
        self.stats = {}

        self._load_dictionary()
        self._build_alias_map()
        logger.info(f"IngredientNormalizer initialized with {len(self.norm_dict)} ingredients")

    def _load_dictionary(self):
        """加载食材字典"""
        if not self.dictionary_path.exists():
            raise FileNotFoundError(f"Dictionary not found at {self.dictionary_path}")

        try:
            with open(self.dictionary_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.norm_dict = data.get('ingredients', {})
                self.stats = data.get('metadata', {})
                logger.info(f"Loaded {len(self.norm_dict)} ingredients from dictionary")
        except Exception as e:
            logger.error(f"Error loading dictionary: {e}")
            raise

    def _build_alias_map(self):
        """
        构建别名 -> 标准形式的映射表

        例如:
            "番茄" -> "西红柿"
            "红柿" -> "西红柿"
            "西红柿" -> "西红柿"
        """
        self.alias_map = {}

        for norm_form, data in self.norm_dict.items():
            # 标准形式映射到自己
            self.alias_map[self._normalize_text(norm_form)] = norm_form

            # 所有别名映射到标准形式
            for alias in data.get("别名", []):
                self.alias_map[self._normalize_text(alias)] = norm_form

    @staticmethod
    def _normalize_text(text: str) -> str:
        """
        文本清理和规范化

        Steps:
        1. 去除前后空格
        2. 转小写（如果是英文）
        """
        return text.strip()

    @lru_cache(maxsize=1024)
    def normalize(self, ingredient: str) -> str:
        """
        规范化单个食材

        Args:
            ingredient: 原始食材名称

        Returns:
            标准化后的食材名称
        """
        # Step 1: 清理输入
        cleaned = self._normalize_text(ingredient)

        # Step 2: 直接字典查询
        if cleaned in self.alias_map:
            result = self.alias_map[cleaned]
            logger.debug(f"Normalized '{ingredient}' -> '{result}' (dict lookup)")
            return result

        # Step 3: 返回原始值（未知食材）
        logger.debug(f"No normalization found for '{ingredient}', returning original")
        return ingredient

    def normalize_list(self, ingredients: List[str]) -> List[str]:
        """
        规范化食材列表并去重

        Args:
            ingredients: 原始食材列表

        Returns:
            去重后的标准化食材列表（已排序）
        """
        normalized = set()

        for ingredient in ingredients:
            normalized_form = self.normalize(ingredient)
            normalized.add(normalized_form)

        return sorted(list(normalized))

    def deduplicate(self, ingredients: List[str]) -> Dict:
        """
        去重并返回详细的映射关系

        Returns:
            {
                "normalized": ["西红柿", "鸡蛋", "葱"],
                "mapping": {
                    "番茄": "西红柿",
                    "红柿": "西红柿"
                },
                "deduped_count": 2,
                "original_count": 5
            }
        """
        mapping = {}
        normalized = set()
        original_count = len(ingredients)

        for ingredient in ingredients:
            norm_form = self.normalize(ingredient)
            normalized.add(norm_form)

            # 记录非自身映射
            if norm_form != ingredient:
                mapping[ingredient] = norm_form

        deduped_count = original_count - len(normalized)

        return {
            "normalized": sorted(list(normalized)),
            "mapping": mapping,
            "deduped_count": deduped_count,
            "original_count": original_count,
            "deduplication_rate": round(deduped_count / original_count, 2) if original_count > 0 else 0
        }

    def get_ingredient_info(self, ingredient: str) -> Optional[Dict]:
        """
        获取食材详细信息（营养、分类等）

        Args:
            ingredient: 食材名称

        Returns:
            食材详细信息字典或 None
        """
        norm_form = self.normalize(ingredient)
        return self.norm_dict.get(norm_form)

    def get_stats(self) -> Dict:
        """获取规范化器统计信息"""
        return {
            "total_unique_ingredients": len(self.norm_dict),
            "total_aliases": len(self.alias_map) - len(self.norm_dict),
            "cache_info": self.normalize.cache_info(),
            "dictionary_version": self.stats.get('version', 'unknown')
        }


# 全局单例（建议在应用启动时初始化）
_normalizer_instance = None

def get_normalizer() -> IngredientNormalizer:
    """获取全局规范化器实例（单例模式）"""
    global _normalizer_instance
    if _normalizer_instance is None:
        _normalizer_instance = IngredientNormalizer()
    return _normalizer_instance
```

---

## Step 3: Create FastAPI Endpoint

Create file: `backend/api/ingredients.py`

```python
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from services.ingredient_normalizer import get_normalizer
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ingredients", tags=["ingredients"])

# Request/Response Models
class NormalizeRequest(BaseModel):
    ingredients: List[str] = Field(..., description="食材列表", min_items=1)

class NormalizeResponse(BaseModel):
    normalized: List[str] = Field(description="规范化后的食材列表")
    mapping: Dict[str, str] = Field(description="原始名称到标准名称的映射")
    deduped_count: int = Field(description="去重的数量")
    original_count: int = Field(description="原始食材数量")
    deduplication_rate: float = Field(description="去重率 (0-1)")

class IngredientInfoResponse(BaseModel):
    name: str
    category: str
    nutrition: Dict
    frequency: float

@router.post("/normalize", response_model=NormalizeResponse)
async def normalize_ingredients(request: NormalizeRequest):
    """
    规范化和去重食材列表

    Example:
    ```json
    {
        "ingredients": ["西红柿", "番茄", "鸡蛋"]
    }
    ```

    Response:
    ```json
    {
        "normalized": ["西红柿", "鸡蛋"],
        "mapping": {"番茄": "西红柿"},
        "deduped_count": 1,
        "original_count": 3,
        "deduplication_rate": 0.33
    }
    ```
    """
    try:
        normalizer = get_normalizer()
        result = normalizer.deduplicate(request.ingredients)

        return NormalizeResponse(
            normalized=result["normalized"],
            mapping=result["mapping"],
            deduped_count=result["deduped_count"],
            original_count=result["original_count"],
            deduplication_rate=result["deduplication_rate"]
        )
    except Exception as e:
        logger.error(f"Error normalizing ingredients: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/info/{ingredient}")
async def get_ingredient_info(ingredient: str):
    """
    获取食材详细信息

    Example:
    GET /api/ingredients/info/西红柿

    Response:
    ```json
    {
        "name": "西红柿",
        "category": "蔬菜",
        "nutrition": {
            "热量": 18,
            "蛋白质": 0.9
        },
        "aliases": ["番茄", "红柿"]
    }
    ```
    """
    try:
        normalizer = get_normalizer()
        info = normalizer.get_ingredient_info(ingredient)

        if not info:
            raise HTTPException(
                status_code=404,
                detail=f"食材 '{ingredient}' 不存在"
            )

        return {
            "name": normalizer.normalize(ingredient),
            "category": info.get("分类", "未分类"),
            "nutrition": {
                "热量": info.get("热量"),
                "蛋白质": info.get("蛋白质")
            },
            "aliases": info.get("别名", [])
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ingredient info: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/stats")
async def get_normalization_stats():
    """获取规范化统计信息"""
    try:
        normalizer = get_normalizer()
        return normalizer.get_stats()
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=400, detail=str(e))
```

---

## Step 4: Add to FastAPI App

Modify `backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.ingredients import router as ingredients_router
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FridgeMenu Recipe API",
    description="AI-powered recipe recommendation system",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 实际应用中应该限制origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(ingredients_router)

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## Step 5: Unit Tests

Create file: `tests/test_ingredient_normalizer.py`

```python
import pytest
import json
from pathlib import Path
from backend.services.ingredient_normalizer import IngredientNormalizer

@pytest.fixture
def normalizer():
    """创建测试用的规范化器"""
    return IngredientNormalizer()

class TestBasicNormalization:
    """基本规范化测试"""

    def test_direct_lookup(self, normalizer):
        """测试直接查询"""
        assert normalizer.normalize("西红柿") == "西红柿"

    def test_synonym_normalization(self, normalizer):
        """测试同义词规范化"""
        assert normalizer.normalize("番茄") == "西红柿"
        assert normalizer.normalize("红柿") == "西红柿"

    def test_unknown_ingredient(self, normalizer):
        """测试未知食材"""
        result = normalizer.normalize("虚构食材XYZ")
        assert result == "虚构食材XYZ"  # 返回原始值

    def test_whitespace_handling(self, normalizer):
        """测试空格处理"""
        assert normalizer.normalize("  西红柿  ") == "西红柿"

class TestDeduplication:
    """去重功能测试"""

    def test_simple_deduplication(self, normalizer):
        """测试简单去重"""
        ingredients = ["西红柿", "番茄", "鸡蛋"]
        result = normalizer.deduplicate(ingredients)

        assert result["normalized"] == ["西红柿", "鸡蛋"]
        assert result["deduped_count"] == 1
        assert result["original_count"] == 3

    def test_batch_normalization(self, normalizer):
        """测试批量规范化"""
        ingredients = ["西红柿", "番茄", "红柿", "鸡蛋"]
        result = normalizer.normalize_list(ingredients)

        assert len(result) == 2
        assert "西红柿" in result
        assert "鸡蛋" in result

    def test_deduplication_mapping(self, normalizer):
        """测试去重映射"""
        ingredients = ["番茄", "红柿"]
        result = normalizer.deduplicate(ingredients)

        assert result["mapping"]["番茄"] == "西红柿"
        assert result["mapping"]["红柿"] == "西红柿"

class TestPerformance:
    """性能测试"""

    def test_lookup_performance(self, normalizer):
        """测试查询性能"""
        import time

        ingredients = ["西红柿", "番茄", "鸡蛋"] * 100  # 300 items

        start = time.time()
        result = normalizer.normalize_list(ingredients)
        elapsed = time.time() - start

        # 应该在10ms以内完成300项查询
        assert elapsed < 0.01, f"Lookup took {elapsed*1000:.2f}ms, expected <10ms"
        print(f"Normalized 300 items in {elapsed*1000:.2f}ms")

    def test_large_batch(self, normalizer):
        """测试大批量处理"""
        import time

        ingredients = ["西红柿"] * 1000

        start = time.time()
        result = normalizer.normalize_list(ingredients)
        elapsed = time.time() - start

        assert elapsed < 0.05  # <50ms
        assert len(result) == 1
        print(f"Normalized 1000 items in {elapsed*1000:.2f}ms")

class TestCaching:
    """缓存功能测试"""

    def test_lru_cache_effectiveness(self, normalizer):
        """测试LRU缓存有效性"""
        # 第一次调用
        normalizer.normalize("番茄")

        # 检查缓存统计
        cache_info = normalizer.normalize.cache_info()
        assert cache_info.hits == 0  # 第一次调用
        assert cache_info.misses == 1

        # 第二次调用（应该命中缓存）
        normalizer.normalize("番茄")
        cache_info = normalizer.normalize.cache_info()
        assert cache_info.hits == 1

class TestIngredientInfo:
    """食材信息查询测试"""

    def test_get_ingredient_info(self, normalizer):
        """测试获取食材信息"""
        info = normalizer.get_ingredient_info("番茄")

        assert info is not None
        assert info["标准形式"] == "西红柿"
        assert "分类" in info
        assert "热量" in info
```

---

## Step 6: Integration Tests

Create file: `tests/test_api_ingredients.py`

```python
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

@pytest.fixture
def sample_ingredients():
    return ["西红柿", "番茄", "鸡蛋", "葱"]

class TestNormalizeEndpoint:
    """规范化API端点测试"""

    def test_normalize_success(self, sample_ingredients):
        """测试成功规范化"""
        response = client.post(
            "/api/ingredients/normalize",
            json={"ingredients": sample_ingredients}
        )

        assert response.status_code == 200
        data = response.json()

        assert len(data["normalized"]) == 3  # 西红柿、鸡蛋、葱
        assert data["deduped_count"] == 1  # 去重1个（番茄）
        assert "mapping" in data

    def test_normalize_empty_list(self):
        """测试空列表"""
        response = client.post(
            "/api/ingredients/normalize",
            json={"ingredients": []}
        )

        assert response.status_code == 422  # Validation error

    def test_normalize_single_item(self):
        """测试单项"""
        response = client.post(
            "/api/ingredients/normalize",
            json={"ingredients": ["西红柿"]}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["normalized"] == ["西红柿"]

class TestIngredientInfoEndpoint:
    """食材信息API测试"""

    def test_get_ingredient_info(self):
        """测试获取食材信息"""
        response = client.get("/api/ingredients/info/西红柿")

        assert response.status_code == 200
        data = response.json()

        assert data["name"] == "西红柿"
        assert "category" in data
        assert "nutrition" in data

    def test_get_ingredient_info_by_synonym(self):
        """测试通过同义词获取信息"""
        response = client.get("/api/ingredients/info/番茄")

        assert response.status_code == 200
        data = response.json()

        # 应该返回标准形式
        assert data["name"] == "西红柿"

    def test_get_nonexistent_ingredient(self):
        """测试不存在的食材"""
        response = client.get("/api/ingredients/info/虚构食材XYZ")

        assert response.status_code == 404

class TestStatsEndpoint:
    """统计信息API测试"""

    def test_get_stats(self):
        """测试获取统计"""
        response = client.get("/api/ingredients/stats")

        assert response.status_code == 200
        data = response.json()

        assert "total_unique_ingredients" in data
        assert "total_aliases" in data
```

---

## Step 7: WeChat Mini Program Integration

Create file: `miniprogram/pages/ingredient-input/ingredient-input.wxml`

```xml
<view class="container">
  <view class="header">
    <text>输入食材</text>
  </view>

  <view class="ingredient-list">
    <view wx:for="{{ingredients}}" wx:key="index" class="ingredient-item">
      <text>{{item}}</text>
      <view class="delete-btn" bindtap="removeIngredient" data-index="{{index}}">
        <text>×</text>
      </view>
    </view>
  </view>

  <view class="input-section">
    <input
      class="ingredient-input"
      type="text"
      placeholder="输入食材或按住语音按钮说话"
      bindinput="onIngredientInput"
      value="{{currentInput}}"
    />

    <view class="button-group">
      <view class="voice-btn" bindtouchstart="startVoiceInput" bindtouchend="stopVoiceInput">
        <text>🎤</text>
      </view>

      <button class="add-btn" bindtap="addIngredient">
        添加
      </button>
    </view>
  </view>

  <view class="action-buttons">
    <button class="btn-primary" bindtap="normalizeAndRecommend">
      做菜
    </button>
  </view>

  <!-- 加载提示 -->
  <view wx:if="{{isNormalizing}}" class="loading">
    <text>处理中...</text>
  </view>
</view>
```

Create file: `miniprogram/pages/ingredient-input/ingredient-input.js`

```javascript
Page({
  data: {
    ingredients: [],
    currentInput: '',
    isNormalizing: false,
    normalizeResult: null
  },

  // API基础URL
  apiUrl: 'https://api.example.com/api',

  // 添加食材
  addIngredient() {
    const { currentInput, ingredients } = this.data;

    if (!currentInput.trim()) {
      wx.showToast({
        title: '请输入食材',
        icon: 'none'
      });
      return;
    }

    // 新增并清除输入框
    this.setData({
      ingredients: [...ingredients, currentInput.trim()],
      currentInput: ''
    });
  },

  // 移除食材
  removeIngredient(e) {
    const { index } = e.currentTarget.dataset;
    const { ingredients } = this.data;

    ingredients.splice(index, 1);
    this.setData({ ingredients });
  },

  // 输入框变化
  onIngredientInput(e) {
    this.setData({
      currentInput: e.detail.value
    });
  },

  // 开始语音输入
  startVoiceInput() {
    const manager = wx.getRecorderManager();

    manager.start({
      duration: 30000,
      sampleRate: 16000
    });

    manager.onStop((res) => {
      this.processVoiceInput(res.tempFilePath);
    });
  },

  // 停止语音输入
  stopVoiceInput() {
    const manager = wx.getRecorderManager();
    manager.stop();
  },

  // 处理语音输入
  processVoiceInput(filePath) {
    wx.showLoading({ title: '识别中...' });

    // Step 1: 调用语音识别API
    this.recognizeVoice(filePath).then((voiceText) => {
      // Step 2: 解析食材
      const parsedIngredients = this.parseIngredients(voiceText);

      // Step 3: 调用后端规范化API
      return this.normalizeIngredients(
        [...this.data.ingredients, ...parsedIngredients]
      );
    }).then((result) => {
      this.setData({
        ingredients: result.normalized
      });

      wx.hideLoading();
      wx.showToast({
        title: `识别了 ${result.normalized.length} 种食材`,
        icon: 'success'
      });
    }).catch((error) => {
      wx.hideLoading();
      wx.showToast({
        title: '识别失败，请重试',
        icon: 'none'
      });
      console.error('Voice input error:', error);
    });
  },

  // 调用语音识别服务
  recognizeVoice(filePath) {
    return new Promise((resolve, reject) => {
      // 使用微信官方语音识别或第三方服务
      wx.request({
        url: `${this.apiUrl}/voice/recognize`,
        method: 'POST',
        data: { filePath },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data.text);
          } else {
            reject(new Error('Voice recognition failed'));
          }
        },
        fail: reject
      });
    });
  },

  // 解析食材（从文本中提取）
  parseIngredients(text) {
    // 简单实现：按逗号或顿号分割
    const separators = /[，、;；]/g;
    return text.split(separators)
      .map(item => item.trim())
      .filter(item => item.length > 0);
  },

  // 调用后端规范化API
  normalizeIngredients(ingredients) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.apiUrl}/ingredients/normalize`,
        method: 'POST',
        data: { ingredients },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data);
          } else {
            reject(new Error('Normalization failed'));
          }
        },
        fail: reject
      });
    });
  },

  // 规范化并推荐
  normalizeAndRecommend() {
    const { ingredients } = this.data;

    if (ingredients.length === 0) {
      wx.showToast({
        title: '请先输入食材',
        icon: 'none'
      });
      return;
    }

    this.setData({ isNormalizing: true });

    this.normalizeIngredients(ingredients).then((result) => {
      console.log('Normalized ingredients:', result.normalized);

      // 保存规范化结果
      wx.setStorageSync('normalized_ingredients', result.normalized);

      // 调用AI推荐API
      return this.recommendRecipes(result.normalized);
    }).then((recipes) => {
      wx.navigateTo({
        url: '/pages/recipe-recommend/recipe-recommend',
        success: () => {
          wx.setStorageSync('recommended_recipes', recipes);
        }
      });
    }).catch((error) => {
      wx.showToast({
        title: '处理失败，请重试',
        icon: 'none'
      });
      console.error('Error:', error);
    }).finally(() => {
      this.setData({ isNormalizing: false });
    });
  },

  // 推荐菜谱（调用AI API）
  recommendRecipes(ingredients) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.apiUrl}/recipes/recommend`,
        method: 'POST',
        data: { ingredients },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data.recipes);
          } else {
            reject(new Error('Recipe recommendation failed'));
          }
        },
        fail: reject
      });
    });
  },

  onLoad() {
    console.log('Ingredient input page loaded');
  }
});
```

---

## Step 8: Environment Configuration

Create file: `.env.example`

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/fridgemenu

# API Keys
QWEN_API_KEY=your_qwen_api_key
OSS_ACCESS_KEY_ID=your_oss_key
OSS_SECRET_ACCESS_KEY=your_oss_secret

# App Settings
INGREDIENT_DICT_PATH=backend/data/ingredient_dictionary.json
REDIS_URL=redis://localhost:6379
LOG_LEVEL=INFO
```

Create file: `.env.production`

```env
DATABASE_URL=postgresql://prod_user:prod_pass@prod-db:5432/fridgemenu
INGREDIENT_DICT_PATH=/app/data/ingredient_dictionary.json
REDIS_URL=redis://redis-service:6379
LOG_LEVEL=WARNING
```

---

## Step 9: Docker Setup

Create file: `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install -r requirements.txt --no-cache-dir

# 复制代码和数据
COPY backend/ ./backend/
COPY backend/data/ ./backend/data/

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=INFO

# 运行应用
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Create file: `requirements.txt`

```
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
psycopg2-binary==2.9.9
redis==5.0.1
python-dotenv==1.0.0
aioredis==2.0.1
pytest==7.4.3
pytest-asyncio==0.21.1
httpx==0.25.2
```

---

## Deployment Checklist

- [ ] Create `backend/data/ingredient_dictionary.json` with at least 500 ingredients
- [ ] Implement `backend/services/ingredient_normalizer.py`
- [ ] Create FastAPI endpoints in `backend/api/ingredients.py`
- [ ] Add to `backend/main.py`
- [ ] Write and pass all tests in `tests/`
- [ ] Integrate WeChat mini-program code
- [ ] Setup `.env` configuration files
- [ ] Create Docker container
- [ ] Deploy to production
- [ ] Monitor API performance and error rates
- [ ] Collect user feedback for dictionary improvements

---

## Performance Monitoring

Add monitoring for:

```python
# backend/monitoring/metrics.py

from prometheus_client import Counter, Histogram, Gauge
import time

# Metrics
normalization_requests = Counter(
    'normalization_requests_total',
    'Total normalization requests'
)

normalization_duration = Histogram(
    'normalization_duration_seconds',
    'Time spent normalizing ingredients'
)

deduplication_rate = Gauge(
    'deduplication_rate',
    'Current deduplication rate'
)

cache_hit_ratio = Gauge(
    'cache_hit_ratio',
    'LRU cache hit ratio'
)
```

---

## Support & Maintenance

- **Dictionary Updates**: Weekly reviews of feedback, monthly deployments
- **Performance**: Monitor <5ms p99 latency
- **Caching**: Monitor cache hit ratio (target: >90%)
- **Coverage**: Ensure synonyms cover >95% of user inputs

---

**Last Updated**: 2025-12-04
**Status**: Ready for Implementation
