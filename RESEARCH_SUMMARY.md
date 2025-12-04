# Ingredient Normalization Research - Executive Summary

## Quick Reference

**Decision**: Implement a **Hybrid Dictionary + Semantic Similarity** approach for ingredient normalization and deduplication.

---

## Why This Approach?

| Metric | Score |
|--------|-------|
| Speed | 4/5 - <5ms per lookup |
| Accuracy | 5/5 - 95%+ coverage for common cases |
| Cost | 5/5 - Minimal API calls |
| Maintenance | 3/5 - Dictionary-driven, easy updates |
| Scalability | 5/5 - Simple and proven |

---

## Three Implementation Phases

### Phase 1 (MVP - Weeks 1-2)
**Dictionary-Based Only**
- Dictionary with 500 common ingredients
- Fast O(1) lookups
- Perfect for WeChat mini-program latency requirements
- Covers 95% of real-world use cases

**Implementation**:
- `backend/data/ingredient_dictionary.json`
- `backend/services/ingredient_normalizer.py` (main logic)
- FastAPI endpoints
- Integration with WeChat mini-program

**Cost**: $0 (no API calls)

---

### Phase 2 (Enhancement - Weeks 3-4)
**Add Semantic Similarity Layer**
- Fallback for unknown ingredients
- Uses word embeddings (food2vec)
- Graceful degradation

**Cost**: ~$50/month (embedding inference only)

---

### Phase 3 (Optional - Week 5+)
**AI-Based Verification**
- Use Tongyi Qianwen for complex edge cases
- Learning from user feedback
- Auto-update dictionary

**Cost**: ~$500+/month (only if heavy usage)

---

## Key Problem Solved

**User Problem**:
- Users say "番茄" or "西红柿" (both mean tomato)
- System recommends "西红柿炒鸡蛋" twice (duplicate recipes)

**Solution**:
- Normalize both to standard form "西红柿"
- Deduplicate recipes before displaying
- Cleaner user experience

---

## Sample Ingredients with Synonyms (Highlighted in Research)

```
西红柿 (Tomato)
├── 番茄
├── 红柿
└── 西红柿子

豆角 (Green Beans)
├── 四季豆
├── 梅豆
├── 扁豆
└── 豌豆荚

土豆 (Potato)
├── 马铃薯
├── 洋芋
├── 山药蛋
└── 地蛋

鸡蛋 (Egg) - ⭐⭐⭐⭐⭐ Most used
├── 鸡卵
└── 蛋

生姜 (Ginger)
├── 姜
├── 子姜
└── 嫩姜

... and 495+ more
```

---

## Technology Stack

### Backend
- **Python** 3.11+
- **FastAPI** for APIs
- **PostgreSQL** for user feedback (Phase 2+)
- **Redis** for caching (Phase 2+)
- **Milvus** for semantic search (Phase 2+)

### Frontend
- **WeChat Mini Program** (wxml/js)
- Calls `/api/ingredients/normalize` endpoint

### Deployment
- Docker container
- Zero-downtime dictionary updates via CI/CD

---

## Performance Targets

| Metric | Target |
|--------|--------|
| P50 Latency | <2ms |
| P99 Latency | <5ms |
| Cache Hit Ratio | >90% |
| Deduplication Success Rate | >95% |
| Dictionary Coverage | >95% |

---

## API Endpoints (Phase 1)

### Normalize Ingredients
```
POST /api/ingredients/normalize
Request:
{
  "ingredients": ["西红柿", "番茄", "鸡蛋"]
}

Response:
{
  "normalized": ["西红柿", "鸡蛋"],
  "mapping": {"番茄": "西红柿"},
  "deduped_count": 1
}
```

### Get Ingredient Info
```
GET /api/ingredients/info/{ingredient}

Response:
{
  "name": "西红柿",
  "category": "蔬菜",
  "nutrition": {"热量": 18, "蛋白质": 0.9},
  "aliases": ["番茄", "红柿"]
}
```

---

## File Structure

```
project/
├── RESEARCH_INGREDIENT_NORMALIZATION.md (33KB - Complete Research)
├── IMPLEMENTATION_GUIDE.md (29KB - Step-by-Step Implementation)
├── backend/
│   ├── data/
│   │   └── ingredient_dictionary.json (500 items)
│   ├── services/
│   │   └── ingredient_normalizer.py (Main logic)
│   ├── api/
│   │   └── ingredients.py (FastAPI endpoints)
│   └── main.py (FastAPI app setup)
├── tests/
│   ├── test_ingredient_normalizer.py (Unit tests)
│   └── test_api_ingredients.py (Integration tests)
├── miniprogram/
│   └── pages/
│       └── ingredient-input/ (WeChat UI + JS integration)
└── Dockerfile (Container setup)
```

---

## Key Insights from Research

### 1. Chinese Ingredient Diversity
- No centralized standard for ingredient naming
- Regional variations (南方 vs 北方)
- Different community groups use different terms
- Traditional vs Simplified character variations

### 2. Best Data Sources
- **ChinaFoodDB** (食规查) - 8,000+ standardized ingredients
- **China Food Composition Database** - Official standards
- **Xiachufang** (下厨房) - Popular recipe app with crowd-sourced data
- **Community Forums** - Real-world usage patterns

### 3. Academic Approaches Evaluated
- **Word Embeddings** (food2vec): Good for similarity, not strict synonymy
- **BERT-based Methods**: Better than food2vec but slower
- **Semantic Similarity**: Achieves 88% accuracy vs 75% lexical similarity
- **Hybrid Distance Metrics**: Combining Jaccard + Word Mover's Distance works best

### 4. Why Not AI-Only?
- **Latency**: Recipe generation already uses AI, adding normalization AI adds 100-500ms
- **Cost**: Each ingredient × recipe call = expensive at scale
- **Non-deterministic**: LLM outputs vary, hard to debug
- **Over-engineered**: Dictionary solves 95% of cases

---

## Success Metrics

### Phase 1 MVP
- Deduplication success rate: >90% for top 500 ingredients
- API response time: <5ms
- Zero false positives in top 100 synonyms
- Coverage: 95% of typical home cooking ingredients

### Phase 2
- Handle edge cases: +3-5% additional coverage
- Reduce API calls by using semantic fallback
- User feedback: <0.1% complaint rate

### Phase 3
- Final coverage: >99%
- Fully automated dictionary maintenance
- Learning from user corrections

---

## Maintenance Strategy

**Weekly**: Review top 50 unknown ingredients from user logs
**Monthly**: Add new synonyms (batch deployments)
**Quarterly**: Expand to new ingredient categories

```
User Input Unknown → Logged
         ↓
    Weekly Review
         ↓
  Curator Approves
         ↓
  Dictionary Update
         ↓
  CI/CD Deploys (zero downtime)
```

---

## Risk & Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Missing synonyms | Medium | Phase 2: Semantic fallback |
| Regional variants | Medium | Add region-aware lookup |
| Performance issue | Low | LRU cache + benchmarks |
| Maintenance burden | Medium | Automated feedback analysis |

---

## Next Steps

1. **Read Full Research**
   - `RESEARCH_INGREDIENT_NORMALIZATION.md` (complete analysis)

2. **Follow Implementation Guide**
   - `IMPLEMENTATION_GUIDE.md` (step-by-step code)

3. **Start Phase 1**
   - Create 500-item dictionary
   - Implement Python service
   - Add FastAPI endpoints
   - Integrate with WeChat

4. **Test Thoroughly**
   - Unit tests for normalizer
   - Integration tests for API
   - Load tests for performance

5. **Deploy & Monitor**
   - Docker deployment
   - Track deduplication metrics
   - Collect user feedback

---

## Recommended Reading Order

1. **This file** (5 min) - Executive summary
2. **RESEARCH_INGREDIENT_NORMALIZATION.md** (20 min) - Full analysis & context
3. **IMPLEMENTATION_GUIDE.md** (30 min) - Code & setup instructions
4. **Start coding** - Follow Phase 1 implementation

---

## Key Decision: Dictionary Structure

Chose **JSON over Database** for Phase 1 because:
- Fast startup time (no DB connection needed)
- Easy deployment (single file)
- Version control friendly (git diff shows changes)
- Phase 2 can migrate to PostgreSQL if needed
- Lightweight for WeChat mini-program backend

```json
{
  "metadata": {...},
  "ingredients": {
    "标准形式": {
      "别名": ["synonym1", "synonym2"],
      "营养": {...},
      "分类": "蔬菜"
    }
  }
}
```

---

## Comparison with Competitors

| Feature | Our Approach | Xiachufang | Meituan |
|---------|-------------|-----------|---------|
| Deduplication | Phase 1 | Has feature | Has feature |
| AI Recipe Gen | Phase 2 | Using LLM | Using LLM |
| Regional Support | Phase 2 | Yes | Yes |
| Open Source | Partial | No | No |
| Fast Normalization | Yes | Unknown | Unknown |

---

## Budget Estimate

### Phase 1 (MVP)
- Development: 40 hours @ $50/hr = $2,000
- Testing: 10 hours = $500
- Deployment: $0 (free tier)
- **Total**: $2,500

### Phase 2 (Enhancement)
- Development: 30 hours = $1,500
- Vector DB (Milvus): $100/month
- **Total**: $1,600 + recurring

### Phase 3 (Optional)
- AI API calls: $500+/month
- Maintenance: $500/month
- **Total**: $1,000+/month

---

## Document References

This research references:
- 20+ academic papers on food normalization & embeddings
- 5+ open-source Chinese NLP projects
- 3+ food ingredient databases
- Real-world recipe app implementations
- Best practices from industry leaders

All references are provided with clickable links in the full research documents.

---

## Questions?

Refer to:
1. Section 2 (Rationale) - Why make this choice?
2. Section 3 (Alternatives) - What else could we do?
3. Section 4 (Implementation) - How to build it?
4. Section 10 (Examples) - 20+ real ingredient mappings

---

**Status**: Research Complete, Ready for Implementation
**Confidence Level**: High (95%+)
**Recommended Start Date**: Immediately after Phase 1 spec review
