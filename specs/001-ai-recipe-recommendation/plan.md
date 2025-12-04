# Implementation Plan: AI智能菜谱推荐

**Branch**: `001-ai-recipe-recommendation` | **Date**: 2025-12-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ai-recipe-recommendation/spec.md`

## Summary

实现一个基于uni-app的微信小程序，用户通过语音输入家中现有食材，系统使用AI大模型推荐可制作的菜品，并为每道菜异步生成AI图片。核心功能包括：语音识别食材、AI菜谱推荐、图片生成与复用、菜谱详情查看、收藏管理。技术方案采用阿里云全家桶（通义千问+通义万相），实现图片库复用机制以降低成本，通过PNG转JPG优化和自动清理策略控制存储。

## Technical Context

**Language/Version**: JavaScript/TypeScript (推荐TypeScript), Node.js 16+ (后端), Vue 3 (uni-app框架)
**Primary Dependencies**:
- 前端: uni-app, Vue 3 (Composition API), Pinia (状态管理), uni-ui
- 后端: Node.js + Express/Koa, Sharp (图片处理), Axios (HTTP客户端)
- AI服务: 阿里云通义千问API, 阿里云通义万相API, 微信小程序语音识别插件

**Storage**:
- 数据库: MySQL 8.0+ (用户数据、菜谱记录、图片库索引、收藏记录)
- 云存储: 阿里云OSS (临时图片存储), 自有CDN/云存储 (永久图片存储)
- 本地存储: 微信小程序本地存储 (缓存、离线数据)

**Testing**:
- 前端: uni-app 官方测试工具 + Jest (单元测试)
- 后端: Jest/Mocha (单元测试), Supertest (API集成测试)
- 跨端测试: 微信开发者工具、H5浏览器、真机测试

**Target Platform**:
- 主要平台: 微信小程序 (首选)
- 扩展平台: H5、支付宝小程序、App (Android/iOS)

**Project Type**: Web (前后端分离架构: uni-app前端 + Node.js后端API)

**Performance Goals**:
- 语音识别响应时间 < 5秒
- AI推荐返回时间 < 8秒 (不含图片)
- AI图片生成时间 < 15秒 (异步)
- 首屏加载时间 < 3秒
- 图片复用率 > 60%
- 单张图片大小 < 200KB

**Constraints**:
- 小程序主包体积 < 2MB
- 图片库容量上限 10GB
- AI接口调用需成本控制和防刷量
- 必须符合《个人信息保护法》和微信小程序审核规范
- 阿里云OSS临时链接有效期 24小时

**Scale/Scope**:
- 初始用户规模: 1000-10000 用户
- 食材词库: 100+ 常见食材
- 收藏容量: 每用户 50 道菜谱
- 图片库: 预计 5000+ 菜品图片
- 并发请求: 峰值 100 QPS

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Initial Constitution Compliance Review

基于 `.specify/memory/constitution.md` 的宪章原则检查：

#### ✅ 一、组件化优先 (Component-First)
- **符合**: 功能将拆分为独立组件（VoiceInput、IngredientList、RecipeCard、RecipeDetail、FavoriteList）
- **设计原则**: 每个组件具有明确的props/events接口，可独立测试
- **验证**: Phase 1 设计阶段将定义完整的组件契约

#### ✅ 二、数据优先 (Data-First)
- **符合**: 已在spec.md中定义核心实体（Ingredient、Recipe、Favorite、ImageLibrary）
- **状态管理**: 使用Pinia进行集中式状态管理
- **持久化策略**:
  - 本地存储: 用户偏好、缓存数据
  - 云端同步: 收藏列表（通过微信openid关联）
- **验证**: Phase 1 将生成完整的 data-model.md

#### ✅ 三、测试先行 (Test-First) - 非强制性
- **符合**: 鼓励但不强制TDD
- **测试覆盖**:
  - 关键业务逻辑（食材去重、图片匹配算法）将编写单元测试
  - 跨端兼容性测试（微信小程序、H5）
- **验证**: Phase 2 tasks.md 将包含测试任务

#### ✅ 四、用户体验一致性 (UX Consistency)
- **符合**: 使用uni-ui组件库确保跨平台一致性
- **设计规范**:
  - 响应式布局适配不同屏幕
  - 遵循微信小程序设计规范
  - 统一的loading/error状态展示
- **验证**: Phase 1 quickstart.md 将包含UI规范

#### ✅ 五、性能与优化 (Performance & Optimization)
- **符合**: 性能指标已在spec.md的成功标准中明确定义
- **优化策略**:
  - 图片压缩和懒加载 (PNG转JPG 80%质量)
  - 图片复用机制 (目标60%复用率)
  - 异步图片生成 (不阻塞主流程)
  - 网络请求loading状态和错误处理
  - 小程序包体积控制 < 2MB
- **验证**: Phase 1 将详细设计性能优化方案

### 潜在违规风险评估

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 组件化架构 | ✅ 通过 | 功能已规划为独立组件 |
| 数据模型清晰 | ✅ 通过 | 核心实体已定义 |
| 跨平台兼容性 | ✅ 通过 | 采用uni-app框架 |
| 性能评估 | ✅ 通过 | 明确的性能指标和优化策略 |
| 代码注释 | ⚠️ 待验证 | 实现阶段需确保中文注释完整性 |

**结论**: 当前设计符合项目宪章所有核心原则。无需填写复杂度跟踪表。

**Re-check Trigger**: Phase 1 设计完成后重新评估组件结构和数据流是否符合宪章。

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-recipe-recommendation/
├── spec.md              # Feature specification (已完成)
├── plan.md              # This file (当前文件)
├── research.md          # Phase 0 output (待生成)
├── data-model.md        # Phase 1 output (待生成)
├── quickstart.md        # Phase 1 output (待生成)
├── contracts/           # Phase 1 output (待生成)
│   ├── api.openapi.yaml # REST API契约
│   └── websocket.md     # WebSocket契约 (图片生成进度推送)
└── tasks.md             # Phase 2 output (通过 /speckit.tasks 命令生成)
```

### Source Code (repository root)

```text
# Web application structure (uni-app前端 + Node.js后端)

# 前端 - uni-app小程序
frontend/
├── src/
│   ├── pages/                    # 页面
│   │   ├── index/               # 首页 (语音输入 + 食材列表)
│   │   ├── recipe-list/         # 推荐菜品列表页
│   │   ├── recipe-detail/       # 菜谱详情页
│   │   └── favorites/           # 收藏页
│   ├── components/               # 可复用组件
│   │   ├── VoiceInput/          # 语音输入组件
│   │   ├── IngredientList/      # 食材列表组件
│   │   ├── RecipeCard/          # 菜品卡片组件
│   │   ├── RecipeDetail/        # 菜谱详情组件
│   │   └── LoadingState/        # 加载状态组件
│   ├── store/                    # Pinia状态管理
│   │   ├── ingredients.js       # 食材状态
│   │   ├── recipes.js           # 菜谱状态
│   │   └── favorites.js         # 收藏状态
│   ├── services/                 # API服务层
│   │   ├── api.js               # API基础配置
│   │   ├── voice.js             # 语音识别服务
│   │   ├── recipe.js            # 菜谱服务
│   │   └── image.js             # 图片服务
│   ├── utils/                    # 工具函数
│   │   ├── auth.js              # 微信授权工具
│   │   ├── storage.js           # 本地存储工具
│   │   └── debounce.js          # 防抖工具
│   └── static/                   # 静态资源
│       ├── images/              # 图标、占位图
│       └── styles/              # 全局样式
├── tests/
│   ├── unit/                    # 单元测试
│   └── integration/             # 集成测试
├── manifest.json                # uni-app配置
├── pages.json                   # 页面路由配置
└── package.json

# 后端 - Node.js API服务
backend/
├── src/
│   ├── models/                   # 数据模型
│   │   ├── Ingredient.js        # 食材模型
│   │   ├── Recipe.js            # 菜谱模型
│   │   ├── Favorite.js          # 收藏模型
│   │   └── ImageLibrary.js      # 图片库模型
│   ├── services/                 # 业务逻辑层
│   │   ├── voiceService.js      # 语音识别服务封装
│   │   ├── aiService.js         # AI推荐服务 (通义千问)
│   │   ├── imageService.js      # 图片生成服务 (通义万相)
│   │   ├── imageProcessService.js # 图片处理服务 (PNG转JPG)
│   │   ├── imageReusService.js  # 图片复用逻辑
│   │   ├── imageCleanupService.js # 图片清理服务
│   │   ├── storageService.js    # 云存储服务
│   │   └── recipeService.js     # 菜谱业务逻辑
│   ├── api/                      # API路由层
│   │   ├── routes/
│   │   │   ├── voice.js         # 语音识别接口
│   │   │   ├── recipe.js        # 菜谱推荐接口
│   │   │   ├── image.js         # 图片相关接口
│   │   │   └── favorite.js      # 收藏接口
│   │   ├── middleware/
│   │   │   ├── auth.js          # 微信授权中间件
│   │   │   ├── rateLimit.js     # 限流中间件
│   │   │   └── errorHandler.js  # 错误处理中间件
│   │   └── validators/
│   │       ├── voiceValidator.js
│   │       └── recipeValidator.js
│   ├── jobs/                     # 定时任务
│   │   ├── imageDownloadJob.js  # 图片下载转存任务
│   │   └── imageCleanupJob.js   # 图片清理任务
│   ├── config/                   # 配置文件
│   │   ├── database.js          # 数据库配置
│   │   ├── aliyun.js            # 阿里云配置
│   │   └── wechat.js            # 微信配置
│   └── app.js                    # 应用入口
├── tests/
│   ├── unit/                    # 单元测试
│   ├── integration/             # 集成测试
│   └── contract/                # 契约测试
├── migrations/                   # 数据库迁移
│   └── 001_initial_schema.sql
├── package.json
└── README.md

# 数据库脚本
database/
├── schema/                      # 表结构定义
│   ├── ingredients.sql
│   ├── recipes.sql
│   ├── favorites.sql
│   └── image_library.sql
└── seeds/                       # 种子数据
    └── common_ingredients.sql   # 常见食材初始数据
```

**Structure Decision**:

采用 **Web application structure (前后端分离架构)**，原因如下：

1. **前端 (uni-app)**:
   - 使用uni-app框架开发微信小程序，天然支持跨平台
   - 采用Vue 3 Composition API + Pinia状态管理
   - 页面结构遵循uni-app规范 (pages + components)

2. **后端 (Node.js API)**:
   - 独立的Node.js后端服务，处理AI接口调用、图片处理、数据库操作
   - 使用Express/Koa提供RESTful API
   - 分层架构: routes (路由) → services (业务逻辑) → models (数据模型)

3. **分离优势**:
   - 前后端独立部署和扩展
   - 后端可处理复杂的AI调用和图片处理逻辑
   - 前端专注用户交互和跨平台兼容性
   - 符合微信小程序的云开发模式

4. **数据库**:
   - 独立的database目录管理SQL schema和migrations
   - 使用MySQL存储结构化数据 (用户、菜谱、图片库索引)

## Complexity Tracking

> 当前设计无宪章违规项，无需填写复杂度跟踪表。

---

## Phase 0: Research & Investigation

**Status**: 🔄 In Progress

### Research Tasks

以下是需要研究的技术决策和最佳实践：

#### 1. 阿里云通义千问API集成
- **研究目标**: 确定API调用方式、Prompt工程最佳实践、成本控制策略
- **关键问题**:
  - 如何设计Prompt让AI根据食材推荐菜谱？
  - 如何解析AI返回的菜谱数据（菜名、食材、步骤）？
  - 如何控制Token消耗和API调用成本？
  - 是否需要流式返回（Streaming）以提升响应速度？

#### 2. 阿里云通义万相API集成
- **研究目标**: 图片生成API调用流程、异步轮询机制、图片质量控制
- **关键问题**:
  - API调用流程：提交任务 → 轮询状态 → 获取图片URL
  - 轮询间隔建议（spec提到10秒，是否最优？）
  - 如何设计Prompt生成高质量的菜品图片？
  - 并发限制和队列管理策略
  - 错误重试机制

#### 3. 微信小程序语音识别插件
- **研究目标**: 微信官方语音识别插件使用方式、准确率优化
- **关键问题**:
  - 使用wx.startRecord还是插件市场的第三方插件？
  - 如何提取食材关键词（NLP后处理）？
  - 是否需要自建NER模型或使用AI大模型提取？
  - 语音识别错误处理和用户反馈机制

#### 4. 图片处理技术选型 (PNG转JPG)
- **研究目标**: 选择图片处理库、压缩质量参数优化
- **关键问题**:
  - Node.js图片处理库选型：Sharp vs Jimp vs ImageMagick
  - PNG转JPG 80%质量参数是否能达到70%大小减少目标？
  - 是否需要进一步优化（如WebP格式考虑）？
  - 图片处理性能和内存占用

#### 5. 云存储方案选择
- **研究目标**: 确定自有云存储/CDN方案
- **关键问题**:
  - 选择阿里云OSS、腾讯云COS、还是第三方CDN？
  - CDN配置和加速策略
  - 图片URL永久有效性保证
  - 存储成本估算 (10GB容量)

#### 6. 图片复用匹配算法
- **研究目标**: 设计高效的图片匹配算法
- **关键问题**:
  - 数据库索引设计（菜名作为主键）
  - 菜名规范化策略（如"西红柿炒鸡蛋" vs "番茄炒蛋"）
  - 查询性能优化（预计5000+图片库）

#### 7. 图片清理策略实现
- **研究目标**: 设计自动清理任务和执行机制
- **关键问题**:
  - 定时任务技术选型：Node-cron vs Bull Queue
  - 清理触发条件：定时扫描 vs 容量阈值触发
  - 清理规则实现：最后使用时间 + 访问次数计算
  - 删除失败的回滚机制

#### 8. 微信小程序状态管理
- **研究目标**: Pinia在uni-app中的使用最佳实践
- **关键问题**:
  - Pinia持久化插件选择
  - 跨页面状态共享策略
  - 与微信小程序storage的集成

#### 9. 异步任务和WebSocket推送
- **研究目标**: 图片生成进度实时推送方案
- **关键问题**:
  - 微信小程序WebSocket API使用
  - 是否需要WebSocket服务器（如Socket.io）？
  - 长轮询 vs WebSocket性能对比
  - 用户离线时图片生成完成的处理

#### 10. 食材去重和规范化算法
- **研究目标**: 实现食材同义词识别
- **关键问题**:
  - 构建食材同义词词典（如"西红柿"="番茄"）
  - 使用AI大模型还是预定义规则？
  - 词典维护和更新策略

### Research Execution Plan

**执行方式**: 使用Task tool并发启动研究代理完成上述10个研究任务

**输出**: `research.md` 文件，包含每个决策的：
- Decision (最终选择)
- Rationale (选择理由)
- Alternatives Considered (考虑的其他方案)

---

## Phase 1: Design & Contracts

**Status**: ⏳ Pending (等待Phase 0完成)

### Phase 1 Outputs

1. **data-model.md**:
   - 基于spec.md中的关键实体设计完整的数据模型
   - 包含表结构、字段类型、关系、索引、验证规则

2. **contracts/** 目录:
   - `api.openapi.yaml`: RESTful API契约 (OpenAPI 3.0规范)
   - `websocket.md`: WebSocket消息契约 (图片生成进度推送)

3. **quickstart.md**:
   - 开发环境搭建指南
   - 本地运行指南
   - API调用示例
   - 常见问题解答

4. **Agent Context Update**:
   - 运行 `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude`
   - 更新 `.claude_code/context.md` 添加本次计划的技术栈信息

### Design Principles

1. **RESTful API设计**:
   - 资源命名遵循REST规范
   - 使用标准HTTP状态码
   - API版本控制 (v1)

2. **数据模型设计**:
   - 遵循数据库范式化原则
   - 合理使用外键和索引
   - 考虑查询性能优化

3. **组件接口设计**:
   - Props类型明确，使用TypeScript类型定义
   - Events命名清晰，遵循Vue 3规范
   - 组件文档完整（使用JSDoc注释）

---

## Phase 2: Task Breakdown

**Status**: ⏳ Pending (等待Phase 1完成)

**执行方式**: 使用 `/speckit.tasks` 命令生成 `tasks.md`

**任务分类**:
1. 基础设施搭建 (数据库、云服务配置)
2. 后端API实现 (按功能需求分解)
3. 前端页面实现 (按用户故事分解)
4. 组件开发 (可复用组件)
5. AI服务集成 (通义千问、通义万相)
6. 图片处理服务 (转换、复用、清理)
7. 测试任务 (单元测试、集成测试、跨端测试)
8. 文档任务 (API文档、使用手册)

---

## Next Steps

1. ✅ **Phase 0**: 执行研究任务，生成 `research.md`
2. ⏳ **Phase 1**: 基于研究结果，生成 `data-model.md`、`contracts/`、`quickstart.md`
3. ⏳ **Phase 2**: 使用 `/speckit.tasks` 命令生成 `tasks.md`
4. ⏳ **Implementation**: 按照 `tasks.md` 开始实现

**当前阶段**: Phase 0 研究任务启动中...
