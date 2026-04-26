export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' || path === '') {
      return listFiles(env);
    }

    if (path.startsWith('/download/')) {
      const key = decodeURIComponent(path.replace('/download/', ''));
      return downloadFile(env, key);
    }

    if (path.startsWith('/api/list')) {
      return listFilesAPI(env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function listFiles(env) {
  try {
    const listed = await env.MY_BUCKET.list();
    const files = listed.objects.map(obj => ({
      key: obj.key,
      size: formatBytes(obj.size),
      uploaded: obj.uploaded.toISOString(),
    }));

    const html = generateHTML(files);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

async function listFilesAPI(env) {
  try {
    const listed = await env.MY_BUCKET.list();
    const files = listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded.toISOString(),
    }));
    return new Response(JSON.stringify(files), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function downloadFile(env, key) {
  try {
    const object = await env.MY_BUCKET.get(key);
    if (!object) {
      return new Response('File not found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(key)}"`);
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new Response(object.body, { headers });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateHTML(files) {
  const fileList = files.map(file => `
    <tr>
      <td class="filename">${escapeHtml(file.key)}</td>
      <td>${file.size}</td>
      <td>${new Date(file.uploaded).toLocaleString()}</td>
      <td><a href="/download/${encodeURIComponent(file.key)}" class="download-btn">下载</a></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>R2 文件列表</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 { font-size: 2em; margin-bottom: 10px; }
    .header p { opacity: 0.9; }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 16px 20px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th {
      background: #f8f9fa;
      font-weight: 600;
      color: #333;
    }
    tr:hover { background: #f5f5f5; }
    .filename {
      max-width: 400px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #333;
    }
    .download-btn {
      display: inline-block;
      padding: 8px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 20px;
      font-size: 14px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .download-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .empty {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; }
    @media (max-width: 768px) {
      .header h1 { font-size: 1.5em; }
      th, td { padding: 12px 10px; font-size: 14px; }
      .filename { max-width: 150px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📁 R2 文件存储</h1>
      <p>Cloudflare R2 存储桶文件列表</p>
    </div>
    ${files.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>文件名</th>
          <th>大小</th>
          <th>上传时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${fileList}
      </tbody>
    </table>
    ` : `
    <div class="empty">
      <div class="empty-icon">📭</div>
      <p>存储桶为空，暂无文件</p>
    </div>
    `}
  </div>
</body>
</html>`;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
