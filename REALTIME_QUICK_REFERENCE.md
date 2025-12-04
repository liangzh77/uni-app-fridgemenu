# 实时通知方案快速参考

## 一句话总结

**使用 Socket.io WebSocket，在网络不稳定时自动降级到 Long Polling；离线用户使用 WeChat 订阅消息。**

---

## 核心数据对比

### 三种方案对比

```
┌─────────────────────────────────────────────────────────────┐
│             选择这个: Socket.io ✅                          │
│                                                             │
│  优点:                                                      │
│  • 延迟 100-500ms (vs Long Polling 1-2s)                  │
│  • 自动降级到 Long Polling                                │
│  • 电池省电 (vs 3-5x 耗电)                                │
│  • 支持 1000+ 用户                                         │
│  • WeChat 小程序原生支持                                   │
│  • 社区成熟，文档完整                                      │
│                                                             │
│  缺点:                                                      │
│  • 需要 WSS 证书                                           │
│  • 库体积 +50KB                                            │
│                                                             │
│  成本: ⭐⭐⭐⭐⭐ (最优)                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│         不推荐: 纯 Long Polling ❌                          │
│                                                             │
│  缺点:                                                      │
│  • 延迟 1-2 秒，用户感觉缓慢                               │
│  • 高并发时服务器压力大                                    │
│  • 电池消耗 3-5 倍                                         │
│  • 网络浪费（90% 空轮询）                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│        可用但复杂: 原生 WebSocket (ws) ⚠️                  │
│                                                             │
│  优点:                                                      │
│  • 低延迟                                                   │
│  • 高效                                                     │
│                                                             │
│  缺点:                                                      │
│  • 需自行实现重连、心跳、降级（工作量大）                │
│  • WeChat 适配需要额外库                                  │
│  • 维护成本高                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 实现核心要点

### 1. 小程序端 (3 步)

```typescript
// Step 1: 安装库
npm install @hyoga/uni-socket.io

// Step 2: 建立连接
const socket = io('https://your-domain.com', {
  reconnection: true,
  transports: ['websocket']
})

// Step 3: 监听图片完成事件
socket.on('image:server:generated', (data) => {
  updateRecipeImage(data.recipeId, data.imageUrl)
})
```

### 2. 服务器端 (3 步)

```typescript
// Step 1: 安装库
npm install socket.io

// Step 2: 创建服务器
const io = new Server(httpServer, {
  transports: ['websocket']
})

// Step 3: 监听连接并推送
io.on('connection', (socket) => {
  socket.on('recipe:client:recommend', async (data) => {
    // 生成图片后
    socket.emit('image:server:generated', {
      recipeId,
      imageUrl,
      status: 'success'
    })
  })
})
```

### 3. 离线用户处理

```javascript
// 用户关闭小程序时
// → 发送 WeChat 订阅消息
wx.requestSubscribeMessage({
  tmplIds: ['template_id'],
  success: () => { /* 已授权 */ }
})

// 用户重新打开时
// → 检查待生成菜品
async function checkPending() {
  const images = await fetchPendingImages()
  updateUI(images)
}
```

---

## 消息格式 (简化版)

```javascript
// 客户端发送
socket.emit('recipe:client:recommend', {
  openId: 'user123',
  ingredients: ['西红柿', '鸡蛋']
})

// 服务器响应
socket.emit('image:server:generated', {
  recipeId: 'rec_123',
  imageUrl: 'https://...',
  status: 'success'  // 或 'failed'
})
```

---

## 关键技术参数

| 参数 | 值 | 说明 |
|------|-----|------|
| **连接延迟** | 100-500ms | WebSocket 延迟 |
| **重连间隔** | 1, 2, 4, 8s | 指数退避 |
| **最多重连次** | 10 次 | 防止无限重试 |
| **心跳间隔** | 25s | 保持连接活跃 |
| **心跳超时** | 60s | 判定连接断开 |
| **降级轮询间隔** | 1-2s | 网络不稳定时 |
| **图片生成时间** | 15s | 后端异步，不阻塞 |

---

## 故障排查

### 问题 1: 连接持续失败

```
症状: socket.on('connect') 从不触发
原因: 1. WSS 证书错误  2. 域名未配置  3. 防火墙阻止

解决:
1. 检查证书: openssl s_client -connect domain:443
2. 小程序后台 → 开发 → 服务器域名，确认 WebSocket 域名
3. 检查防火墙/代理是否允许 WebSocket
```

### 问题 2: 连接常断开

```
症状: 连接后 30 秒内断开
原因: 心跳检测失败、代理层关闭连接

解决:
1. 增加 pingInterval: 20000
2. 使用 Socket.io 自动重连
3. 检查代理配置（如 Nginx）:
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
```

### 问题 3: 图片更新延迟很高

```
症状: 图片生成完成但等待 2+ 秒才显示
原因: 降级到 Long Polling 或网络问题

解决:
1. 检查 socket.io 的 transports 配置
2. 查看浏览器开发者工具的网络面板
3. 如果是 Long Polling，延迟正常
4. 增加 pingInterval 延长检测间隔
```

### 问题 4: 高并发时服务器卡顿

```
症状: 1000+ 用户同时使用，响应缓慢
原因: 数据库连接池耗尽、图片生成队列堆积

解决:
1. 增加数据库连接池大小: connectionLimit: 20-30
2. 使用消息队列（Redis/RabbitMQ）缓冲生成任务
3. 实现图片库缓存策略，减少重复生成
4. 添加请求限流，防止单用户刷量
```

---

## 性能优化建议

### 优化 1: 图片库复用

```javascript
// 生成前查询
const cached = await queryImageLibrary(recipeName)
if (cached) {
  // 使用缓存，延迟 < 100ms
  return cached.imageUrl
}
// 否则生成，延迟 15s
```

### 优化 2: 批量生成

```javascript
// 一次推荐 2-3 道菜，并发生成所有图片
Promise.all(
  recipes.map(r => generateImage(r.name))
)
```

### 优化 3: CDN 加速

```javascript
// 图片存储在 CDN，加速全国用户访问
const imageUrl = 'https://cdn.yourdomain.com/images/...'
```

### 优化 4: 降级显示

```javascript
// 图片生成失败时隐藏图片区域，仅显示文字
if (imageStatus === 'failed') {
  // 隐藏 <image> 组件
  // 保持显示菜名、食材、步骤
}
```

---

## 代码片段速查

### 建立连接
```javascript
const socket = io('https://api.domain.com', {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,
  transports: ['websocket']
})
```

### 监听事件
```javascript
socket.on('image:server:generated', (data) => {
  console.log('图片完成:', data)
})
```

### 发送消息
```javascript
socket.emit('recipe:client:recommend', {
  openId: 'user123',
  ingredients: ['鸡蛋', '西红柿']
})
```

### 断开连接
```javascript
socket.disconnect()
```

### 重新连接
```javascript
socket.connect()
```

---

## 配置清单

### 小程序后台配置

- [ ] **开发** → **服务器域名** → **WebSocket** → 添加 `wss://your-domain.com`
- [ ] 确认域名已备案（国内要求）
- [ ] 配置有效期 > 3 个月的 SSL 证书

### 服务器配置（Node.js）

```javascript
// .env 文件
VUE_APP_SOCKET_URL=https://api.yourdomain.com
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=***
DB_NAME=fridgemenu
ALIBABA_API_KEY=***
ALIBABA_AI_REGION=cn-hangzhou
```

### Nginx 反向代理配置

```nginx
upstream socket_backend {
  server 127.0.0.1:3000;
}

server {
  listen 443 ssl;
  server_name api.yourdomain.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://socket_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

---

## 常见问题 Q&A

**Q: WebSocket 会不会消耗大量流量？**

A: 不会。WebSocket 持久连接空闲时零流量，仅在有数据时传输。相比 Long Polling 频繁的空请求，WebSocket 更省流量。

**Q: 如果用户网络是 HTTP 代理，WebSocket 能用吗？**

A: 大多数代理支持 WebSocket（CONNECT 隧道）。Socket.io 会自动降级到 Long Polling，保证功能可用。

**Q: 图片生成失败了怎么办？**

A: 根据规格要求，隐藏图片区域，仅显示菜品文字信息（菜名、食材、步骤），不显示错误提示。

**Q: 能支持多少用户同时在线？**

A: 单个服务器可支持 5000+ 用户的 WebSocket 连接。可通过 Redis 的 Pub/Sub 进行多服务器扩展。

**Q: 用户在后台时能收到推送吗？**

A: 不能。微信禁止后台推送。改用订阅消息（用户需授权），或在用户返回前台时轮询检查。

**Q: 如果服务器宕机了，用户会怎样？**

A: Socket.io 自动重连。如果服务器长时间不可用，会重连失败，自动降级到 Long Polling。用户手动重启小程序可恢复。

---

## 决策时间线

| 阶段 | 任务 | 时间 |
|------|------|------|
| **Phase 1** | 生成 Socket.io 服务器框架 | 1 天 |
| **Phase 2** | 实现小程序端连接 + 事件处理 | 2 天 |
| **Phase 3** | 集成图片生成和通知逻辑 | 2 天 |
| **Phase 4** | 离线场景和降级测试 | 2 天 |
| **Phase 5** | 性能压测和优化 | 2 天 |
| **总计** | | ~9 天 |

---

## 下一步行动

1. **立即**: 在小程序和服务器项目中添加 Socket.io 依赖
2. **今天**: 创建 WebSocket 连接基础框架，测试连接成功
3. **明天**: 实现图片生成事件推送逻辑
4. **本周**: 完成离线场景处理和降级测试
5. **下周**: 性能压测和上线前检查

---

**快速决策**: 使用 Socket.io，配置 3 个参数（reconnect, pingInterval, transports），即可实现一个生产级别的实时通知系统。✅
