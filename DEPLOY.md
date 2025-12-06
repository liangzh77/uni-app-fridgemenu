# Railway 部署指南

## 前置要求

1. GitHub 账号（代码已推送到 GitHub）
2. Railway 账号（https://railway.app）
3. 阿里云账号（用于 AI 服务）
4. 微信小程序 AppID 和 Secret

## 第一步：部署后端到 Railway

### 1.1 创建 Railway 项目

1. 访问 https://railway.app 并登录（用 GitHub 登录）
2. 点击 "New Project"
3. 选择 "Deploy from GitHub repo"
4. 选择你的仓库 `uni-app-fridgemenu`
5. Railway 会自动检测 `backend` 目录

### 1.2 配置后端服务

在 Railway 项目中：
1. 点击你的后端服务
2. 进入 "Settings" 标签
3. 在 "Root Directory" 中填写: `backend`
4. 保存设置

### 1.3 添加 MySQL 数据库

1. 在项目中点击 "New" → "Database" → "Add MySQL"
2. Railway 会自动创建 MySQL 实例并注入环境变量

### 1.4 添加 Redis

1. 在项目中点击 "New" → "Database" → "Add Redis"
2. Railway 会自动创建 Redis 实例并注入环境变量

### 1.5 配置环境变量

在后端服务的 "Variables" 标签中添加以下变量：

```
# 基础配置
NODE_ENV=production

# 数据库（Railway 自动注入，格式转换）
DB_HOST=${MYSQLHOST}
DB_PORT=${MYSQLPORT}
DB_NAME=${MYSQLDATABASE}
DB_USER=${MYSQLUSER}
DB_PASSWORD=${MYSQLPASSWORD}

# Redis（Railway 自动注入）
REDIS_HOST=${REDISHOST}
REDIS_PORT=${REDISPORT}
REDIS_PASSWORD=${REDISPASSWORD}

# 阿里云配置（从你的阿里云控制台获取）
ALIYUN_ACCESS_KEY_ID=你的AccessKeyId
ALIYUN_ACCESS_KEY_SECRET=你的AccessKeySecret
ALIYUN_REGION=cn-shanghai

# 通义千问 API
DASHSCOPE_API_KEY=你的DashScope密钥

# OSS配置（可选，不配置则使用临时URL）
OSS_BUCKET=your_bucket_name
OSS_ENDPOINT=oss-cn-shanghai.aliyuncs.com

# 微信小程序
WECHAT_APPID=你的小程序AppID
WECHAT_SECRET=你的小程序Secret

# 安全配置
JWT_SECRET=随机生成一个32位以上的字符串
```

### 1.6 初始化数据库

部署成功后，需要运行数据库迁移：

1. 在 Railway 项目中，进入后端服务
2. 点击 "Settings" → "Command" 区域
3. 或者在本地连接 Railway 数据库运行迁移

```bash
# 本地安装 Railway CLI
npm install -g @railway/cli

# 登录
railway login

# 链接项目
railway link

# 运行迁移
railway run npm run db:migrate
```

### 1.7 获取后端 URL

部署完成后，Railway 会提供一个 URL，格式类似：
```
https://your-project-name.up.railway.app
```

记住这个 URL，下一步需要用到。

---

## 第二步：配置前端

### 2.1 更新生产环境配置

编辑 `frontend/.env.production`：

```
VITE_API_BASE_URL=https://your-project-name.up.railway.app
```

将 `your-project-name` 替换为你的实际 Railway 后端 URL。

### 2.2 构建微信小程序

```bash
cd frontend
npm run build:mp-weixin
```

构建产物在 `frontend/dist/build/mp-weixin` 目录。

### 2.3 上传到微信小程序

1. 打开微信开发者工具
2. 导入 `frontend/dist/build/mp-weixin` 目录
3. 点击右上角 "上传" 按钮
4. 填写版本号和备注
5. 在微信公众平台提交审核

---

## 第三步：微信后台配置

### 3.1 配置服务器域名

在微信公众平台（mp.weixin.qq.com）：

1. 进入 "开发" → "开发管理" → "开发设置"
2. 找到 "服务器域名"
3. 添加以下域名：

**request 合法域名：**
```
https://your-project-name.up.railway.app
```

**uploadFile 合法域名：**
```
https://your-project-name.up.railway.app
```

**downloadFile 合法域名：**
```
https://dashscope.aliyuncs.com
```
（用于下载 AI 生成的图片）

---

## 费用说明

### Railway 免费额度（Hobby Plan）
- 每月 $5 免费额度
- 执行时间：500 小时/月
- 足够小型项目使用

### 阿里云费用
- 通义千问：按调用次数计费，有免费额度
- 通义万相：按图片数量计费
- OSS：按存储和流量计费（可选，不用则使用临时URL）

---

## 常见问题

### Q: 部署后 502 错误？
A: 检查环境变量是否正确配置，特别是数据库连接。

### Q: 数据库连接失败？
A: 确保 Railway MySQL 插件已添加，环境变量引用正确。

### Q: 小程序调用接口失败？
A: 检查微信后台的服务器域名配置是否添加了 Railway URL。

### Q: 图片不显示？
A: 检查 downloadFile 域名是否配置了阿里云域名。

---

## 快速验证

部署完成后，访问以下 URL 验证后端是否正常：

```
https://your-project-name.up.railway.app/health
```

应该返回：
```json
{
  "status": "ok",
  "timestamp": "...",
  "uptime": ...
}
```
