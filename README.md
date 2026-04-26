# listr2 - Cloudflare R2 文件列表服务

基于 Cloudflare Workers 的 R2 存储桶文件列表和下载服务。

## 功能特性

- 📁 列出 R2 存储桶中的所有文件
- 📊 显示文件大小、上传时间等元数据
- ⬇️ 支持文件下载
- 🎨 美观的响应式 UI 界面
- 🔌 提供 RESTful API 接口
- 🚀 部署在 Cloudflare 全球边缘网络

## 项目结构

```
listr2/
├── src/
│   └── index.js      # Worker 主代码
├── wrangler.toml     # Cloudflare 配置
└── package.json      # 项目配置
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 R2 存储桶

编辑 `wrangler.toml` 文件：

```toml
name = "listr2"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "your-bucket-name"  # 替换为你的 R2 存储桶名称
```

### 3. 本地开发

```bash
npm run dev
```

访问 `http://localhost:8787` 预览

### 4. 部署到 Cloudflare

#### 方式一：使用 Wrangler CLI

```bash
npm run deploy
```

#### 方式二：通过 GitHub 部署（推荐）

1. 将代码推送到 GitHub
2. 登录 Cloudflare Dashboard
3. 进入 **Workers & Pages** → **Create application** → **Pages**
4. 点击 **Connect to Git**，选择你的仓库
5. 配置构建设置：
   - **Framework preset**: None
   - **Build command**: `npm install`
   - **Deploy command**: (留空)
6. 点击 **Save and Deploy**

### 5. 绑定 R2 存储桶

1. 在 Pages 项目中，进入 **Settings** → **Functions**
2. 找到 **R2 bucket bindings**
3. 点击 **Add binding**
4. 填写：
   - **Variable name**: `MY_BUCKET`
   - **R2 bucket**: 选择你的存储桶
5. 点击 **Save**
6. 重新部署以应用更改

## API 文档

### 1. 列出文件列表

**请求**
```
GET /api/list
```

**响应示例**
```json
[
  {
    "key": "documents/file.pdf",
    "size": 1024000,
    "uploaded": "2024-01-15T10:30:00.000Z"
  },
  {
    "key": "images/photo.jpg",
    "size": 2048576,
    "uploaded": "2024-01-16T14:20:00.000Z"
  }
]
```

### 2. 下载文件

**请求**
```
GET /download/{filename}
```

**参数说明**
- `filename`: 文件的完整路径（需要 URL 编码）

**示例**
```
GET /download/documents/file.pdf
GET /download/images%2Fphoto.jpg
```

**响应**
- Content-Type: 根据文件类型自动设置
- Content-Disposition: attachment（强制下载）
- Cache-Control: public, max-age=31536000（缓存 1 年）

### 3. 网页文件列表

**请求**
```
GET /
```

返回 HTML 页面，展示所有文件的列表和下载按钮。

## 博客集成示例

### 方式一：使用 iframe

在你的博客页面中嵌入：

```html
<iframe 
  src="https://your-worker.your-subdomain.workers.dev" 
  width="100%" 
  height="800px"
  style="border: none;"
></iframe>
```

### 方式二：使用 API 自定义展示

```html
<div id="file-list"></div>

<script>
async function loadFiles() {
  const response = await fetch('https://your-worker.your-subdomain.workers.dev/api/list');
  const files = await response.json();
  
  const html = files.map(file => `
    <div class="file-item">
      <span class="filename">${file.key}</span>
      <span class="size">${formatBytes(file.size)}</span>
      <a href="https://your-worker.your-subdomain.workers.dev/download/${encodeURIComponent(file.key)}">下载</a>
    </div>
  `).join('');
  
  document.getElementById('file-list').innerHTML = html;
}

function formatBytes(bytes) {
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

loadFiles();
</script>
```

### 方式三：在博客路由中配置

如果使用静态博客（如 Hexo、Hugo），可以在 `yuuu.top/file` 路径创建页面：

```html
---
title: 文件下载
layout: page
---

<style>
.file-container {
  max-width: 1200px;
  margin: 0 auto;
}
</style>

<div class="file-container">
  <iframe 
    src="https://your-worker.your-subdomain.workers.dev" 
    width="100%" 
    height="800px"
    style="border: none;"
  ></iframe>
</div>
```

## 环境变量

| 变量名 | 说明 | 必需 |
|--------|------|------|
| MY_BUCKET | R2 存储桶绑定 | 是 |

## 自定义配置

### 修改文件列表样式

编辑 `src/index.js` 中的 `generateHTML()` 函数来自定义 HTML 页面样式。

### 添加文件过滤

在 `listFiles()` 函数中添加过滤逻辑：

```javascript
const files = listed.objects
  .filter(obj => obj.key.startsWith('public/'))  // 只列出 public 目录
  .map(obj => ({
    key: obj.key,
    size: formatBytes(obj.size),
    uploaded: obj.uploaded.toISOString(),
  }));
```

### 添加访问控制

在 Worker 开头添加认证检查：

```javascript
async fetch(request, env, ctx) {
  const token = request.headers.get('Authorization');
  if (token !== 'Bearer YOUR_SECRET_TOKEN') {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... 其余代码
}
```

## 注意事项

1. **R2 存储桶权限**: 确保 Cloudflare Workers 有权限访问绑定的 R2 存储桶
2. **CORS**: 如需跨域访问，在 Worker 中添加 CORS 响应头
3. **文件大小限制**: Cloudflare Workers 响应大小限制为 100MB
4. **带宽**: 免费计划每月有 10GB 带宽限制

## 故障排查

### 问题：显示 "Error: MY_BUCKET is not defined"

**解决方案**: 在 Cloudflare Pages 设置中正确绑定 R2 存储桶

### 问题：文件无法下载

**解决方案**: 
1. 检查 R2 存储桶中文件是否存在
2. 确认文件名 URL 编码正确
3. 检查 Workers 日志

### 问题：本地开发无法连接 R2

**解决方案**: 本地开发需要使用 `wrangler dev --persist` 或使用 Cloudflare 的 R2 开发模式
