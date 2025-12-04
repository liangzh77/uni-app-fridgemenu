# 研究报告：异步任务和实时推送方案 (WebSocket vs Long Polling)

**研究日期**: 2025-12-04
**背景**: AI图片生成耗时最长15秒，需要通知前端生成完成以便立即展示图片
**目标平台**: 微信小程序 (uni-app) + Node.js 后端

---

## 核心决策

### 推荐方案：WebSocket + Push Notification 混合方案

**最终建议**:
1. **主要方案**: WebSocket (使用 Socket.io 3.x)
2. **备选方案**: Long Polling (作为降级方案)
3. **离线通知**: WeChat 订阅消息 (因微信禁止主动推送)

**适用场景**:
- ✅ 用户在小程序前台：使用 WebSocket 实时通知
- ✅ 用户关闭小程序或后台运行：使用 WeChat 订阅消息
- ✅ 网络不稳定环境：自动降级为 Long Polling

---

## 完整分析

### 1. WeChat 小程序 WebSocket API 支持情况

#### ✅ 官方支持情况

WeChat 小程序原生支持 WebSocket，通过 `wx.connectSocket()` API 实现：

**API 限制**:
- **版本限制**: 微信基础库 1.7.0+ 支持多个 WebSocket 连接
- **连接限制**: 最多 5 个并发 WebSocket 连接
- **协议要求**: 必须使用 `wss://` (加密连接)
- **域名配置**: 需在小程序后台配置 WebSocket 通信域名

**生命周期事件**:
```javascript
// 建立连接
wx.connectSocket({
  url: 'wss://example.com/socket',
  success: () => console.log('连接成功')
});

// 监听连接打开
wx.onSocketOpen(() => {
  console.log('WebSocket 已打开');
  // 发送数据必须在 onSocketOpen 后
});

// 监听消息
wx.onSocketMessage((res) => {
  console.log('收到消息:', res.data);
});

// 监听连接关闭
wx.onSocketClose(() => {
  console.log('WebSocket 已关闭');
});

// 监听错误
wx.onSocketError((res) => {
  console.log('WebSocket 错误:', res.errMsg);
});
```

#### 跨页面导航时的连接管理

微信小程序 WebSocket 连接会在应用级别维护，**不会因为页面切换而断开**。开发者需要：

1. 在 `App.vue` 生命周期建立全局连接
2. 使用 Pinia 或全局状态管理维护连接状态
3. 实现心跳检测防止连接被服务器关闭

---

### 2. Node.js WebSocket 服务器方案选择

#### 方案对比：ws vs Socket.io

| 指标 | ws (原生 WebSocket) | Socket.io (增强层) |
|------|-------------------|------------------|
| **性能** | 更高，50K+ 并发连接 | 稍低，但足够用 |
| **延迟** | 更低，原生协议 | 稍高，有额外开销 |
| **功能** | 基础 WebSocket 通信 | 自动重连、房间、命名空间、降级 |
| **兼容性** | 需自行处理降级 | 自动 WebSocket→Long Polling 降级 |
| **学习曲线** | 陡峭，需自行实现复杂逻辑 | 平缓，提供完整 API |
| **生态** | 较小 | 更大，社区成熟 |
| **WeChat 适配** | 需使用 weapp-socketio | 需使用 @hyoga/uni-socket.io |

#### 推荐选择：Socket.io 3.x

**原因**:
1. **WeChat 适配成熟**: weapp-socketio 库完全兼容，基于 socket.io@3.x
2. **自动降级**: 网络不佳时自动从 WebSocket 降级到 Long Polling
3. **生产级别**: 提供自动重连、心跳、错误恢复等功能
4. **降低复杂度**: 减少自行实现的工作量
5. **易于监控**: 内置事件系统便于调试和监控

---

### 3. WebSocket vs Long Polling 性能对比

#### 延迟比较

| 方案 | 平均延迟 | 延迟波动 | 适用场景 |
|------|--------|--------|--------|
| **WebSocket** | 100-500ms | 稳定 ✅ | 实时推送（< 1秒） |
| **Long Polling** | 500ms-2s | 高变化性 ❌ | 低频更新（5-10秒间隔） |

**图片生成通知延迟需求**: WebSocket 能在 100-500ms 内通知，Long Polling 会有 500ms-2s 的延迟。

#### 资源使用对比

**服务器资源**:
- WebSocket: 1 个持久连接，连续维护
- Long Polling: 每个轮询都是新 HTTP 请求，TCP 三次握手重复，服务器负载高

**网络带宽**:
- WebSocket: 数据头部开销小（2-4 字节）
- Long Polling: 每次请求包含 HTTP 头、Cookie（100+ 字节），大部分时间被浪费

**客户端电池续航（关键指标）**:
- WebSocket: 持久连接保活，WiFi 可进入睡眠，电池消耗低
- Long Polling: 频繁唤醒设备建立连接，电池消耗高 3-5 倍

#### 为什么选择 WebSocket 用于图片生成通知？

1. **延迟要求**: 15秒生成完成后需立即通知（< 500ms），Long Polling 轮询间隔至少 1-2 秒
2. **高频更新**: 可能多个用户同时生成，Long Polling 会导致服务器压力急增
3. **成本控制**: WebSocket 持久连接成本更低，符合成本可控要求
4. **电池优化**: 用户可能在小程序前台等待结果，WebSocket 更省电

---

### 4. 具体实现方案细节

#### 4.1 WeChat 小程序端（uni-app）实现

**库选择**: `@hyoga/uni-socket.io`

```javascript
// main.js 或 app setup
import { io } from '@hyoga/uni-socket.io'

const socket = io('https://your-api-domain.com', {
  // 自动重连配置
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,

  // 心跳配置
  pingInterval: 25000,
  pingTimeout: 60000,

  // 传输配置（小程序上 WebSocket 是唯一选项）
  transports: ['websocket']
})

// 连接事件
socket.on('connect', () => {
  console.log('已连接，socket id:', socket.id)
  // 发送用户标识
  socket.emit('auth', {
    openId: wx.getStorageSync('openId'),
    sessionId: generateSessionId()
  })
})

socket.on('disconnect', (reason) => {
  console.log('断开连接:', reason)
  // 显示离线提示
})

socket.on('error', (error) => {
  console.error('连接错误:', error)
})

// 监听图片生成完成事件
socket.on('image:generated', (data) => {
  const { recipeId, imageUrl, status } = data

  if (status === 'success') {
    // 更新 UI 显示图片
    updateRecipeImage(recipeId, imageUrl)
  } else if (status === 'failed') {
    // 隐藏图片区域，只显示文字信息
    hideRecipeImage(recipeId)
  }
})

export default socket
```

**在 Vue 组件中使用**:

```vue
<template>
  <div class="recipe-card">
    <div v-if="imageUrl" class="recipe-image">
      <image :src="imageUrl" />
    </div>
    <div class="recipe-info">
      <h3>{{ recipe.name }}</h3>
      <p>{{ recipe.ingredients }}</p>
    </div>
    <div v-if="isGenerating" class="loading">
      <span>图片生成中...</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import socket from '@/utils/socket'

const props = defineProps({
  recipe: Object
})

const imageUrl = ref('')
const isGenerating = ref(false)

// 监听后端图片生成事件
onMounted(() => {
  socket.on('image:generating', (data) => {
    if (data.recipeId === props.recipe.id) {
      isGenerating.value = true
    }
  })

  socket.on('image:generated', (data) => {
    if (data.recipeId === props.recipe.id) {
      isGenerating.value = false
      if (data.status === 'success') {
        imageUrl.value = data.imageUrl
      }
    }
  })
})
</script>
```

#### 4.2 Node.js 后端实现

**库选择**: `socket.io@4.x`

```javascript
// server.js
const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const axios = require('axios')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: ['https://your-miniprogram-domain.com'],
    methods: ['GET', 'POST']
  },
  // 小程序适配
  transports: ['websocket']
})

// 存储用户与 socket 的映射关系
const userSockets = new Map()

io.on('connection', (socket) => {
  console.log('新连接:', socket.id)

  // 客户端身份验证
  socket.on('auth', (data) => {
    const { openId, sessionId } = data
    userSockets.set(openId, {
      socketId: socket.id,
      sessionId,
      connectedAt: Date.now()
    })
    console.log(`用户 ${openId} 已连接`)
  })

  // 用户发起图片生成请求
  socket.on('generate:image', async (data) => {
    const { recipeId, recipeName, ingredients } = data

    try {
      // 通知客户端开始生成
      socket.emit('image:generating', { recipeId })

      // 调用 AI 图片生成接口（阿里云通义万相）
      const imageUrl = await generateImageWithAlibabaCloud(recipeName)

      // 下载并转换图片（PNG → JPG）
      const permanentUrl = await downloadAndConvertImage(imageUrl, recipeId)

      // 保存到数据库
      await saveImageToLibrary({
        recipeId,
        recipeName,
        imageUrl: permanentUrl,
        ingredients,
        createdAt: new Date()
      })

      // 通知客户端生成成功
      socket.emit('image:generated', {
        recipeId,
        imageUrl: permanentUrl,
        status: 'success'
      })
    } catch (error) {
      console.error('图片生成失败:', error)
      // 通知客户端生成失败
      socket.emit('image:generated', {
        recipeId,
        status: 'failed'
      })
    }
  })

  // 用户断开连接
  socket.on('disconnect', () => {
    // 清理用户映射关系
    for (const [openId, userInfo] of userSockets.entries()) {
      if (userInfo.socketId === socket.id) {
        userSockets.delete(openId)
        break
      }
    }
    console.log('用户断开连接:', socket.id)
  })
})

// AI 图片生成函数
async function generateImageWithAlibabaCloud(recipeName) {
  const response = await axios.post(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generate',
    {
      model: 'wanx-v1',
      input: {
        prompt: `高清菜肴照片：${recipeName}`
      },
      parameters: {
        size: '1024*1024',
        n: 1,
        seed: Math.random() * 1000000
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.ALIBABA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  )

  return response.data.output.results[0].url
}

// 广播给特定用户（用于离线场景）
function notifyUser(openId, eventName, data) {
  const userInfo = userSockets.get(openId)
  if (userInfo) {
    io.to(userInfo.socketId).emit(eventName, data)
  }
}

httpServer.listen(3000, () => {
  console.log('Socket.io 服务器运行在 3000 端口')
})
```

#### 4.3 消息协议设计

**统一 JSON 消息格式**:

```javascript
// 事件名称规范
{
  // 图片生成相关
  'image:generating'      // 后端 → 客户端：开始生成
  'image:generated'       // 后端 → 客户端：生成完成
  'image:batch:generate'  // 后端 → 客户端：批量生成

  // 用户操作
  'recipe:recommend'      // 客户端 → 后端：请求推荐菜品
  'recipe:favorite'       // 客户端 → 后端：收藏菜品

  // 连接管理
  'auth'                  // 客户端 → 后端：身份验证
  'ping'                  // 定期心跳
  'pong'                  // 心跳响应
}

// 消息体示例
{
  // 图片生成通知
  "eventName": "image:generated",
  "data": {
    "recipeId": "recipe_123",
    "recipeName": "西红柿炒鸡蛋",
    "imageUrl": "https://cdn.example.com/images/xxx.jpg",
    "status": "success|failed",  // success 或 failed
    "generatedAt": "2025-12-04T12:00:00Z"
  }
}
```

---

### 5. 离线场景处理方案

#### 5.1 用户在小程序前台（WebSocket 连接活跃）

✅ **处理方式**: 直接通过 WebSocket 实时推送

```javascript
socket.on('image:generated', (data) => {
  // 立即更新 UI
  updateRecipeImage(data.recipeId, data.imageUrl)
})
```

#### 5.2 用户关闭小程序或进入后台

❌ **不能使用**: WeChat 禁止主动推送通知

✅ **替代方案**: 启用 WeChat 订阅消息（需用户授权）

```javascript
// 用户首次调用"做"按钮时，申请订阅权限
wx.requestSubscribeMessage({
  tmplIds: ['weixin_template_id_for_image_ready'],
  success(res) {
    // 用户已授权
    // 保存订阅状态到后端
  },
  fail(res) {
    // 用户拒绝，图片生成完成时无法通知
    console.log('用户未授权订阅消息')
  }
})

// 后端在图片生成完成后，向 WeChat 服务器发送订阅消息
async function sendSubscriptionMessage(openId, templateId, data) {
  const accessToken = await getWeChatAccessToken()

  await axios.post(
    `https://api.weixin.qq.com/msg/subscribe/send?access_token=${accessToken}`,
    {
      touser: openId,
      template_id: templateId,
      page: '/pages/recipe-detail',
      data: {
        'thing5': { value: data.recipeName },
        'thing6': { value: '图片生成成功，点击查看' }
      }
    }
  )
}
```

#### 5.3 用户重新打开小程序

✅ **处理方式**: 启动时轮询查询待生成的菜品

```javascript
// app.vue onLaunch 或 onShow
async function checkPendingImages() {
  const openId = wx.getStorageSync('openId')

  // 查询所有待生成或已生成的菜品
  const response = await uni.request({
    url: 'https://your-api.com/recipes/pending',
    data: { openId },
    method: 'GET'
  })

  const { pendingRecipes, completedRecipes } = response.data

  // 更新已完成的菜品图片
  completedRecipes.forEach(recipe => {
    if (recipe.imageUrl) {
      updateRecipeImage(recipe.id, recipe.imageUrl)
    }
  })

  // 继续监听待生成的菜品
  pendingRecipes.forEach(recipe => {
    monitorImageGeneration(recipe.id)
  })
}

// 单个菜品的长轮询监听（最多 30 秒）
async function monitorImageGeneration(recipeId) {
  let attempts = 0
  const maxAttempts = 30 // 30 秒超时

  const poll = async () => {
    attempts++

    const response = await uni.request({
      url: `https://your-api.com/images/${recipeId}`,
      method: 'GET'
    })

    if (response.data.status === 'completed') {
      updateRecipeImage(recipeId, response.data.imageUrl)
      return
    }

    if (attempts < maxAttempts) {
      // 1 秒后重新轮询
      setTimeout(poll, 1000)
    } else {
      // 超时，隐藏图片区域
      hideRecipeImage(recipeId)
    }
  }

  poll()
}
```

#### 5.4 数据库存储离线生成状态

需要在数据库中维护菜品生成状态，支持离线查询：

```sql
-- 菜品图片生成状态表
CREATE TABLE recipe_image_generation (
  id INT PRIMARY KEY AUTO_INCREMENT,
  open_id VARCHAR(255),
  recipe_id VARCHAR(255),
  recipe_name VARCHAR(255),
  status ENUM('pending', 'generating', 'completed', 'failed'),
  image_url VARCHAR(2000),
  error_message TEXT,
  created_at DATETIME,
  completed_at DATETIME,
  INDEX idx_open_id (open_id),
  INDEX idx_recipe_id (recipe_id),
  INDEX idx_status (status)
);
```

---

### 6. 连接生命周期管理

#### 6.1 打开连接

```javascript
// 在应用启动时建立单一全局 WebSocket 连接
// app.vue setup()

import { reactive } from 'vue'
import socket from '@/utils/socket'

const socketState = reactive({
  isConnected: false,
  lastConnectedAt: null,
  reconnectAttempts: 0
})

// 监听连接事件
socket.on('connect', () => {
  socketState.isConnected = true
  socketState.lastConnectedAt = new Date()
  socketState.reconnectAttempts = 0
  console.log('Socket.io 已连接')

  // 身份验证
  socket.emit('auth', {
    openId: wx.getStorageSync('openId'),
    timestamp: Date.now()
  })
})

socket.on('connect_error', (error) => {
  console.error('连接错误:', error)
})
```

#### 6.2 错误处理与重连

Socket.io 内置自动重连机制，使用指数退避算法：

```javascript
// 重连配置已在初始化时设置
// reconnectionDelay: 1000ms
// reconnectionDelayMax: 5000ms
// reconnectionAttempts: 10

// 自定义重连逻辑（可选）
socket.io.engine.on('upgrade', () => {
  console.log('传输升级到 WebSocket')
})

socket.on('disconnect', (reason) => {
  socketState.isConnected = false

  if (reason === 'io server disconnect') {
    // 服务器主动断开，需要手动重连
    socket.connect()
  }
  // 其他原因（网络问题）会自动重连
})
```

#### 6.3 关闭连接

```javascript
// 应用退出时优雅关闭
socket.disconnect()
```

---

### 7. 性能优化建议

#### 7.1 使用缓存减少生成次数

实现图片库复用机制，目标复用率 60%+：

```javascript
// 在调用 AI 生成前查询图片库
async function getOrGenerateImage(recipeName) {
  // 查询图片库
  const cachedImage = await queryImageLibrary({
    recipeName,
    status: 'completed'
  })

  if (cachedImage) {
    // 直接返回缓存图片，延迟 < 100ms
    return {
      imageUrl: cachedImage.imageUrl,
      source: 'cache'
    }
  }

  // 调用 AI 生成，延迟 15 秒
  return {
    imageUrl: await generateImage(recipeName),
    source: 'generated'
  }
}
```

#### 7.2 批量处理多菜品生成

推荐菜品通常是多道，应该批量异步生成以提高效率：

```javascript
// 后端：并发生成所有推荐菜品的图片
async function generateImagesForRecipes(recipes) {
  const promises = recipes.map(recipe =>
    generateImageWithAlibabaCloud(recipe.name)
      .then(url => ({
        recipeId: recipe.id,
        imageUrl: url,
        status: 'success'
      }))
      .catch(err => ({
        recipeId: recipe.id,
        status: 'failed'
      }))
  )

  const results = await Promise.allSettled(promises)

  // 逐个通知客户端
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      socket.emit('image:generated', result.value)
    }
  })
}
```

#### 7.3 心跳检测防止连接闲置

Socket.io 自动处理心跳（pingInterval: 25s）。如果需要自定义：

```javascript
// 服务器端心跳
setInterval(() => {
  io.emit('ping', { timestamp: Date.now() })
}, 25000)

socket.on('pong', (data) => {
  console.log('收到心跳响应')
})
```

---

## 决策与理由

### 决策

**针对 AI 图片生成的实时通知，采用 WebSocket + Long Polling 混合方案：**

1. **在线场景**（用户在小程序前台）: WebSocket
2. **后台/离线场景**: WeChat 订阅消息 + 启动时轮询
3. **网络降级**: 自动降级为 Long Polling (Socket.io 内置)

### 理由

#### 为什么选 WebSocket?

1. **延迟优势**:
   - 图片生成完成后需立即通知（< 500ms）
   - WebSocket 延迟 100-500ms，Long Polling 500ms-2s
   - 用户体验：等待 0.5s 感觉立即，等待 2s 感觉延迟

2. **资源高效**:
   - 单个持久连接 vs 频繁新建 HTTP 连接
   - 服务器可支持 5K-10K 并发用户
   - 电池消耗降低 3-5 倍

3. **小程序原生支持**:
   - WeChat 原生 `wx.connectSocket` API
   - weapp-socketio 库成熟（基于 socket.io 3.x）
   - 与微信小程序设计完全适配

4. **成本控制**:
   - 符合规格中"避免重复调用 AI 接口"的要求
   - WebSocket 持久连接成本低于频繁轮询

#### 为什么不仅用 Long Polling?

❌ **不适合** 的原因：
- 图片生成 15 秒，轮询间隔至少 1-2 秒，会产生 1-2 秒延迟
- 多用户同时生成时，服务器轮询请求量急增（N 倍增长）
- 电池消耗过高，频繁唤醒设备建立 HTTP 连接
- 浪费网络带宽（大量空轮询，无数据返回）

#### 为什么选 Socket.io 而不是原生 ws?

✅ **Socket.io 优势**:
- 自动降级机制：WebSocket → Long Polling
- 自动重连：指数退避算法，防止服务器压力
- 心跳检测：防止连接被代理层关闭
- 房间和命名空间：支持用户分组发送
- WeChat 适配：weapp-socketio 库成熟可用

❌ **原生 ws 劣势**:
- 需要手动实现重连、心跳、降级逻辑（复杂）
- WeChat 小程序适配困难（无官方适配库）
- 无法自动降级到 Long Polling
- 服务器负载管理需自行实现

---

## 备选方案评估

### 方案 A：纯 Long Polling

| 指标 | 评分 | 说明 |
|------|------|------|
| 延迟 | ❌ 2/5 | 1-2秒延迟，用户感觉缓慢 |
| 实现复杂度 | ✅ 5/5 | 简单，仅需 HTTP 轮询 |
| 电池续航 | ❌ 2/5 | 频繁唤醒，消耗 3-5 倍电量 |
| 服务器成本 | ❌ 2/5 | 高并发时服务器压力大 |
| WeChat 兼容 | ✅ 5/5 | 无需特殊支持 |

**结论**: ❌ **不推荐** - 延迟和电池消耗不符合用户体验要求

### 方案 B：纯 WebSocket (ws)

| 指标 | 评分 | 说明 |
|------|------|------|
| 延迟 | ✅ 5/5 | 100-500ms，立即感知 |
| 实现复杂度 | ❌ 2/5 | 需自行实现重连、心跳 |
| 电池续航 | ✅ 5/5 | 持久连接，省电 |
| 服务器成本 | ✅ 5/5 | 低开销，可支持大并发 |
| WeChat 兼容 | ❌ 3/5 | 需 weapp-socketio 适配 |

**结论**: ⚠️ **有风险** - 需自行处理降级和重连，增加开发负担

### 方案 C：WebSocket + Long Polling (Socket.io)

| 指标 | 评分 | 说明 |
|------|------|------|
| 延迟 | ✅ 5/5 | WebSocket 100-500ms |
| 实现复杂度 | ✅ 4/5 | Socket.io 提供完整 API |
| 电池续航 | ✅ 5/5 | 优先 WebSocket，自动降级 |
| 服务器成本 | ✅ 5/5 | 自动优化，支持大并发 |
| WeChat 兼容 | ✅ 5/5 | weapp-socketio 成熟支持 |

**结论**: ✅ **推荐** - 综合性能最优，降级机制完整

### 方案 D：Server-Sent Events (SSE)

SSE 提供服务器到客户端的单向推送，但：
- ❌ WeChat 小程序不支持 SSE
- ❌ 微信代理层常会关闭 HTTP 长连接
- ❌ 不适合小程序环境

**结论**: ❌ **不适用** - 小程序限制

---

## 关键实现细节

### Message Protocol Design

```javascript
// Socket.io 事件命名空间
/image - 图片生成相关
/recipe - 菜品推荐相关
/user - 用户相关

// 示例消息交互流程

// 1. 用户点击"做"按钮，发送推荐请求
socket.emit('/recipe:request', {
  openId: 'xxx',
  ingredients: ['西红柿', '鸡蛋', '葱'],
  timestamp: 1234567890
})

// 2. 后端返回推荐结果
socket.on('/recipe:recommended', {
  recipeId: 'rec_123',
  recipeName: '西红柿炒鸡蛋',
  ingredients: ['西红柿', '鸡蛋'],
  steps: [...]
})

// 3. 后端开始生成图片
socket.emit('/image:generating', {
  recipeId: 'rec_123'
})

// 4. 图片生成完成（或失败）
socket.emit('/image:generated', {
  recipeId: 'rec_123',
  imageUrl: 'https://...',
  status: 'success'
})
```

### Connection Lifecycle

```
应用启动
  ↓
[onLaunch] 建立 WebSocket 连接
  ↓
socket.connect() → 发送 'auth' 事件
  ↓
[on('connect')] 连接成功 → 可发送业务事件
  ↓
[页面切换] 连接保持不变（小程序级别）
  ↓
[网络中断] Socket.io 自动重连（指数退避）
  ↓
[onUnload/switchTab] 连接保持
  ↓
[应用退出] socket.disconnect()
```

### Offline/Reconnection Handling

```
场景 1: 用户在前台，图片生成完成
  ✅ WebSocket 实时推送 → 立即更新 UI

场景 2: 用户切到后台，图片生成完成
  1. WebSocket 连接仍活跃（小程序保持）
  2. 后端推送消息到 Socket.io
  3. 消息缓存在 Socket.io 缓冲区
  4. 用户返回前台 → 立即收到消息

场景 3: 用户关闭小程序，图片生成完成
  1. WebSocket 连接断开
  2. 后端无法推送（因为没有连接）
  3. 发送 WeChat 订阅消息（需用户授权）
  4. 用户打开订阅消息 → 跳转到小程序
  5. [onShow] 轮询查询待生成菜品状态

场景 4: 网络从 WiFi 切换到 4G
  1. WebSocket 连接中断
  2. Socket.io 检测到 ping 超时
  3. 自动重连（指数退避）
  4. 重连成功后继续接收推送

场景 5: 网络环境恶劣（丢包率高）
  1. WebSocket 建立失败
  2. Socket.io 自动降级到 Long Polling
  3. 改为 HTTP 轮询获取状态
  4. 延迟增加，但功能可用
```

---

## 示例代码完整集合

### 小程序端完整示例

**utils/socket.js**:
```javascript
import { io } from '@hyoga/uni-socket.io'

const socket = io(process.env.VUE_APP_SOCKET_URL || 'https://api.example.com', {
  // 重连配置
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,

  // 心跳配置
  pingInterval: 25000,
  pingTimeout: 60000,

  // 小程序限制：仅支持 WebSocket
  transports: ['websocket']
})

export default socket
```

**app.vue**:
```vue
<script setup>
import { reactive, onMounted, onUnload } from 'vue'
import socket from '@/utils/socket'

// 全局连接状态
const connectionState = reactive({
  isConnected: false,
  lastConnectedAt: null,
  reconnectAttempts: 0
})

onMounted(() => {
  // 监听连接事件
  socket.on('connect', () => {
    connectionState.isConnected = true
    connectionState.lastConnectedAt = new Date()

    // 发送身份验证
    socket.emit('auth', {
      openId: uni.getStorageSync('openId'),
      sessionId: uni.getStorageSync('sessionId')
    })
  })

  socket.on('disconnect', () => {
    connectionState.isConnected = false
  })

  socket.on('error', (error) => {
    console.error('Socket 错误:', error)
  })
})

onUnload(() => {
  socket.disconnect()
})
</script>

<template>
  <view class="app">
    <!-- 离线提示 -->
    <view v-if="!connectionState.isConnected" class="offline-banner">
      网络连接已断开，部分功能可能不可用
    </view>

    <!-- 页面内容 -->
    <router-view />
  </view>
</template>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background-color: #ff6b6b;
  color: white;
  padding: 10px;
  text-align: center;
  z-index: 999;
}
</style>
```

**pages/recommend/index.vue**:
```vue
<template>
  <view class="recommend-page">
    <view class="recipe-list">
      <view v-for="recipe in recipes" :key="recipe.id" class="recipe-card">
        <!-- 图片区域 -->
        <view v-if="recipe.imageUrl" class="recipe-image">
          <image :src="recipe.imageUrl" />
        </view>

        <!-- 生成中 -->
        <view v-if="recipe.isGenerating" class="generating-placeholder">
          <text>图片生成中...</text>
        </view>

        <!-- 信息 -->
        <view class="recipe-info">
          <text class="recipe-name">{{ recipe.name }}</text>
          <text class="recipe-ingredients">{{ recipe.ingredients }}</text>
        </view>

        <!-- 操作按钮 -->
        <view class="recipe-actions">
          <button @click="viewDetail(recipe.id)">查看详情</button>
          <button @click="toggleFavorite(recipe.id)">
            {{ recipe.isFavorited ? '取消收藏' : '收藏' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import socket from '@/utils/socket'
import * as recipeService from '@/services/recipe'

const recipes = ref([])
const isLoading = ref(false)

// 推荐菜品
async function recommendRecipes(ingredients) {
  isLoading.value = true

  try {
    // 调用后端 API 获取推荐菜品
    const response = await recipeService.recommendRecipes({
      openId: uni.getStorageSync('openId'),
      ingredients
    })

    recipes.value = response.data.map(r => ({
      ...r,
      isGenerating: true,
      imageUrl: null
    }))

    // 监听图片生成完成事件
    recipes.value.forEach(recipe => {
      socket.on(`image:generated:${recipe.id}`, handleImageGenerated)
    })
  } finally {
    isLoading.value = false
  }
}

// 处理图片生成完成
function handleImageGenerated(data) {
  const recipe = recipes.value.find(r => r.id === data.recipeId)
  if (recipe) {
    recipe.isGenerating = false
    if (data.status === 'success') {
      recipe.imageUrl = data.imageUrl
    }
  }
}

// 查看菜品详情
function viewDetail(recipeId) {
  uni.navigateTo({
    url: `/pages/recipe-detail?id=${recipeId}`
  })
}

// 收藏菜品
async function toggleFavorite(recipeId) {
  const recipe = recipes.value.find(r => r.id === recipeId)
  recipe.isFavorited = !recipe.isFavorited

  await recipeService.toggleFavorite({
    openId: uni.getStorageSync('openId'),
    recipeId,
    isFavorited: recipe.isFavorited
  })
}

onMounted(() => {
  const route = useRoute()
  const ingredients = route.query.ingredients || []
  recommendRecipes(ingredients)
})
</script>

<style scoped>
.recipe-list {
  padding: 10px;
}

.recipe-card {
  margin-bottom: 15px;
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
}

.recipe-image {
  width: 100%;
  height: 200px;
  background-color: #f5f5f5;
}

.recipe-image image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.generating-placeholder {
  width: 100%;
  height: 200px;
  background-color: #f9f9f9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

.recipe-info {
  padding: 10px;
}

.recipe-name {
  font-weight: bold;
  font-size: 16px;
}

.recipe-ingredients {
  font-size: 12px;
  color: #666;
  display: block;
  margin-top: 5px;
}

.recipe-actions {
  padding: 10px;
  display: flex;
  gap: 10px;
}

.recipe-actions button {
  flex: 1;
  padding: 8px;
  background-color: #007aff;
  color: white;
  border: none;
  border-radius: 4px;
}
</style>
```

### 后端完整示例

**server.js**:
```javascript
const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const axios = require('axios')
const mysql = require('mysql2/promise')
require('dotenv').config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['https://example.com'],
    methods: ['GET', 'POST']
  },
  transports: ['websocket']
})

// 连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

// 用户 socket 映射
const userSocketMap = new Map()

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log(`新客户端连接: ${socket.id}`)

  // 身份验证
  socket.on('auth', async (data) => {
    const { openId, sessionId } = data
    userSocketMap.set(openId, {
      socketId: socket.id,
      sessionId,
      connectedAt: Date.now()
    })

    console.log(`用户认证: ${openId}`)

    // 检查该用户是否有待生成的菜品
    await checkPendingImages(openId, socket)
  })

  // 接收菜品推荐请求
  socket.on('recipe:request', async (data) => {
    const { openId, ingredients } = data

    try {
      // 调用 AI 推荐菜品
      const recipes = await recommendRecipes(ingredients)

      // 发送推荐结果
      socket.emit('recipe:recommended', {
        recipes,
        requestId: data.timestamp
      })

      // 异步生成菜品图片
      generateImagesAsync(recipes, openId)
    } catch (error) {
      console.error('菜品推荐失败:', error)
      socket.emit('error', {
        message: '推荐失败，请重试',
        code: 'RECOMMEND_FAILED'
      })
    }
  })

  // 收藏菜品
  socket.on('recipe:favorite', async (data) => {
    const { openId, recipeId, isFavorited } = data

    try {
      if (isFavorited) {
        await saveFavorite(openId, recipeId)
      } else {
        await removeFavorite(openId, recipeId)
      }

      socket.emit('recipe:favorite:ack', {
        recipeId,
        success: true
      })
    } catch (error) {
      console.error('收藏操作失败:', error)
      socket.emit('recipe:favorite:ack', {
        recipeId,
        success: false
      })
    }
  })

  // 断开连接
  socket.on('disconnect', () => {
    // 移除用户映射
    for (const [openId, userInfo] of userSocketMap.entries()) {
      if (userInfo.socketId === socket.id) {
        userSocketMap.delete(openId)
        console.log(`用户断开连接: ${openId}`)
        break
      }
    }
  })

  // 错误处理
  socket.on('error', (error) => {
    console.error('Socket 错误:', error)
  })
})

// 异步生成图片
async function generateImagesAsync(recipes, openId) {
  for (const recipe of recipes) {
    try {
      // 检查图片库
      const cachedImage = await getImageFromLibrary(recipe.name)

      if (cachedImage) {
        // 使用缓存图片
        const userSocket = userSocketMap.get(openId)
        if (userSocket) {
          io.to(userSocket.socketId).emit('image:generated', {
            recipeId: recipe.id,
            imageUrl: cachedImage.imageUrl,
            status: 'success',
            source: 'cache'
          })
        }
      } else {
        // 生成新图片
        notifyImageGenerating(recipe.id, openId)
        await generateAndSaveImage(recipe, openId)
      }
    } catch (error) {
      console.error(`菜品 ${recipe.name} 图片生成失败:`, error)
      notifyImageFailed(recipe.id, openId)
    }
  }
}

// 通知开始生成
function notifyImageGenerating(recipeId, openId) {
  const userSocket = userSocketMap.get(openId)
  if (userSocket) {
    io.to(userSocket.socketId).emit('image:generating', { recipeId })
  }
}

// 通知生成失败
function notifyImageFailed(recipeId, openId) {
  const userSocket = userSocketMap.get(openId)
  if (userSocket) {
    io.to(userSocket.socketId).emit('image:generated', {
      recipeId,
      status: 'failed'
    })
  }
}

// 生成并保存图片
async function generateAndSaveImage(recipe, openId) {
  try {
    // 调用阿里云通义万相生成图片
    const imageUrl = await generateImageWithAlibabaCloud(recipe.name)

    // 下载并转换为 JPG
    const jpgUrl = await downloadAndConvertToJpg(imageUrl, recipe.id)

    // 保存到数据库
    await saveImageToLibrary({
      recipeName: recipe.name,
      imageUrl: jpgUrl,
      createdAt: new Date()
    })

    // 通知客户端
    const userSocket = userSocketMap.get(openId)
    if (userSocket) {
      io.to(userSocket.socketId).emit('image:generated', {
        recipeId: recipe.id,
        imageUrl: jpgUrl,
        status: 'success',
        source: 'generated'
      })
    } else {
      // 用户已离线，发送订阅消息
      await sendSubscriptionMessage(openId, recipe.name)
    }
  } catch (error) {
    console.error('图片生成失败:', error)
    notifyImageFailed(recipe.id, openId)
  }
}

// 检查待生成菜品
async function checkPendingImages(openId, socket) {
  try {
    const conn = await pool.getConnection()
    const [rows] = await conn.query(
      'SELECT id, recipe_name, status FROM recipe_image_generation WHERE open_id = ?',
      [openId]
    )
    conn.release()

    // 发送待生成菜品列表
    socket.emit('pending:images', {
      images: rows
    })
  } catch (error) {
    console.error('查询待生成菜品失败:', error)
  }
}

// 其他辅助函数...
async function recommendRecipes(ingredients) {
  // 调用大模型 API
}

async function generateImageWithAlibabaCloud(recipeName) {
  // 调用通义万相 API
}

async function downloadAndConvertToJpg(imageUrl, recipeId) {
  // 下载图片并转换为 JPG
}

async function getImageFromLibrary(recipeName) {
  // 查询图片库
}

async function saveImageToLibrary(imageData) {
  // 保存到数据库
}

async function saveFavorite(openId, recipeId) {
  // 保存收藏
}

async function removeFavorite(openId, recipeId) {
  // 移除收藏
}

async function sendSubscriptionMessage(openId, recipeName) {
  // 发送订阅消息
}

httpServer.listen(3000, () => {
  console.log('服务器运行在 3000 端口')
})
```

---

## 性能指标对标

基于 AI 图片生成 15 秒的特点，预期性能指标：

| 指标 | 目标 | WebSocket | Long Polling | 说明 |
|------|------|-----------|---------------|------|
| **图片出现延迟** | < 1s | ✅ 0.1-0.5s | ❌ 1-2s | 生成完成后到用户看到的时间 |
| **小程序包体积** | < 2MB | ✅ +50KB (socket.io) | ✅ 0KB | Socket.io 库较小 |
| **服务器并发支持** | 1000+ | ✅ 5000+ | ⚠️ 1000-2000 | WebSocket 更高效 |
| **电池消耗** | 低 | ✅ 很低 | ❌ 很高 | WebSocket 省电 |
| **网络波动恢复** | < 5s | ✅ 自动重连 | ✅ 下次轮询 | Socket.io 自动处理 |
| **图片复用率** | > 60% | ✅ 缓存加速 | ✅ 缓存加速 | 两者都支持 |

---

## 部署建议

### 生产环境检查清单

- [ ] 配置 WebSocket 安全（WSS）证书
- [ ] 小程序后台配置 WebSocket 通信域名
- [ ] 实现速率限制防止滥用
- [ ] 配置数据库连接池（10-20 连接）
- [ ] 设置日志系统监控连接状态
- [ ] 实现健康检查接口 (`/health`)
- [ ] 配置 CDN 加速图片分发
- [ ] 测试网络中断和重连场景
- [ ] 测试多用户并发生成场景
- [ ] 性能压测（1000+ 并发连接）

---

## 参考资源

- [WeChat 小程序 WebSocket API 文档](https://developers.weixin.qq.com/miniprogram/en/dev/api/network/websocket/wx.connectSocket.html)
- [weapp.socket.io GitHub](https://github.com/weapp-socketio/weapp.socket.io)
- [@hyoga/uni-socket.io](https://github.com/hyoga/uni-socket.io)
- [Socket.io 文档](https://socket.io/docs/)
- [Long Polling vs WebSocket 对比](https://ably.com/blog/websockets-vs-long-polling)
- [WebSocket 重连最佳实践](https://dev.to/hexshift/robust-websocket-reconnection-strategies-in-javascript-with-exponential-backoff-40n1)
