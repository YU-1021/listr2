export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/login') {
      return handleLogin(request, env);
    }

    if (path === '/api/verify') {
      return handleVerify(request, env);
    }

    if (path === '/api/logout') {
      return handleLogout();
    }

    if (path === '/api/list') {
      return withAuth(request, env, () => listFilesAPI(env));
    }

    if (path === '/api/upload') {
      return withAuth(request, env, () => handleUpload(request, env));
    }

    if (path === '/api/delete') {
      return withAuth(request, env, () => handleDelete(request, env));
    }

    if (path === '/api/mkdir') {
      return withAuth(request, env, () => handleMkdir(request, env));
    }

    if (path.startsWith('/download/')) {
      const key = decodeURIComponent(path.replace('/download/', ''));
      return downloadFile(env, key);
    }

    if (path === '/' || path === '') {
      return serveMainPage(env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

function withAuth(request, env, handler) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/auth_token=([^;]+)/);

  if (!match || !verifyToken(match[1], env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return handler();
}

function verifyToken(token, env) {
  if (!env.PASSWORD) return true;
  try {
    const decoded = atob(token);
    const [password, timestamp] = decoded.split(':');
    if (password !== env.PASSWORD) return false;
    const tokenTime = parseInt(timestamp);
    if (Date.now() - tokenTime > 24 * 60 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

async function handleLogin(request, env) {
  if (!env.PASSWORD) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await request.json();
  if (data.password === env.PASSWORD) {
    const token = btoa(`${env.PASSWORD}:${Date.now()}`);
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
      },
    });
  }

  return new Response(JSON.stringify({ success: false, error: '密码错误' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleVerify(request, env) {
  if (!env.PASSWORD) {
    return new Response(JSON.stringify({ authenticated: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/auth_token=([^;]+)/);

  if (match && verifyToken(match[1], env)) {
    return new Response(JSON.stringify({ authenticated: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ authenticated: false }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleLogout() {
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'auth_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
    },
  });
}

async function listFilesAPI(env) {
  try {
    const listed = await env.files.list();
    const files = listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded.toISOString(),
    }));
    return new Response(JSON.stringify(files), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = formData.get('folder') || '';

    if (!file) {
      return new Response(JSON.stringify({ error: '没有选择文件' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const key = folder ? `${folder}/${file.name}` : file.name;
    await env.files.put(key, file.stream());

    return new Response(JSON.stringify({ success: true, key }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleDelete(request, env) {
  try {
    const data = await request.json();
    const key = data.key;

    if (!key) {
      return new Response(JSON.stringify({ error: '缺少文件名' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await env.files.delete(key);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleMkdir(request, env) {
  try {
    const data = await request.json();
    const folderPath = data.path;

    if (!folderPath) {
      return new Response(JSON.stringify({ error: '缺少文件夹路径' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const placeholderKey = folderPath.endsWith('/') ? folderPath + '.keep' : folderPath + '/.keep';
    await env.files.put(placeholderKey, '');

    return new Response(JSON.stringify({ success: true }), {
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
    const object = await env.files.get(key);
    if (!object) {
      return new Response('File not found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(key)}"`);
    headers.set('Cache-Control', 'public, max-age=31536000');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

function serveMainPage(env) {
  const requirePassword = !!env.PASSWORD;
  return new Response(generateMainHTML(requirePassword), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

function generateMainHTML(requirePassword) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>R2 文件管理</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .login-container {
      max-width: 400px;
      margin: 100px auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 40px;
    }
    .login-container h2 {
      text-align: center;
      margin-bottom: 30px;
      color: #333;
    }
    .login-input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #eee;
      border-radius: 8px;
      font-size: 16px;
      margin-bottom: 20px;
      transition: border-color 0.2s;
    }
    .login-input:focus {
      outline: none;
      border-color: #667eea;
    }
    .login-btn {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .login-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .login-error {
      color: #e74c3c;
      text-align: center;
      margin-top: 15px;
      font-size: 14px;
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
    .toolbar {
      padding: 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #eee;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .toolbar-btn {
      padding: 10px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .toolbar-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .toolbar-btn.logout {
      background: #e74c3c;
      margin-left: auto;
    }
    .folder-select {
      padding: 10px 16px;
      border: 2px solid #eee;
      border-radius: 8px;
      font-size: 14px;
      background: white;
      min-width: 200px;
    }
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
    .actions {
      display: flex;
      gap: 8px;
    }
    .download-btn {
      display: inline-block;
      padding: 6px 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-size: 13px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .download-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .delete-btn {
      padding: 6px 16px;
      background: #e74c3c;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .delete-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(231, 76, 60, 0.4);
    }
    .empty {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; }
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal.active { display: flex; }
    .modal-content {
      background: white;
      border-radius: 16px;
      padding: 30px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .modal-title {
      font-size: 1.3em;
      margin-bottom: 20px;
      color: #333;
    }
    .modal-input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #eee;
      border-radius: 8px;
      font-size: 16px;
      margin-bottom: 20px;
    }
    .modal-input:focus {
      outline: none;
      border-color: #667eea;
    }
    .modal-buttons {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }
    .modal-btn {
      padding: 10px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .modal-btn.cancel {
      background: #eee;
      color: #666;
    }
    .modal-btn.confirm {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .modal-btn.danger {
      background: #e74c3c;
      color: white;
    }
    .modal-btn:hover {
      transform: translateY(-2px);
    }
    .file-input-wrapper {
      position: relative;
      overflow: hidden;
      display: inline-block;
    }
    .file-input-wrapper input[type=file] {
      position: absolute;
      left: 0;
      top: 0;
      opacity: 0;
      cursor: pointer;
      width: 100%;
      height: 100%;
    }
    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    @media (max-width: 768px) {
      .header h1 { font-size: 1.5em; }
      th, td { padding: 12px 10px; font-size: 14px; }
      .filename { max-width: 150px; }
      .toolbar { flex-direction: column; }
      .toolbar-btn { width: 100%; justify-content: center; }
      .toolbar-btn.logout { margin-left: 0; }
    }
  </style>
</head>
<body>
  <div id="login-page" class="login-container" style="display: none;">
    <h2>🔐 请输入密码</h2>
    <input type="password" id="password-input" class="login-input" placeholder="输入访问密码" onkeypress="if(event.key==='Enter')login()">
    <button class="login-btn" onclick="login()">进入</button>
    <div id="login-error" class="login-error"></div>
  </div>

  <div id="main-page" style="display: none;">
    <div class="container">
      <div class="header">
        <h1>📁 R2 文件管理</h1>
        <p>Cloudflare R2 存储桶文件管理系统</p>
      </div>
      <div class="toolbar">
        <select id="folder-select" class="folder-select" onchange="changeFolder()">
          <option value="">根目录</option>
        </select>
        <div class="file-input-wrapper">
          <button class="toolbar-btn">📤 上传文件</button>
          <input type="file" id="file-input" onchange="uploadFile()" multiple>
        </div>
        <button class="toolbar-btn" onclick="showMkdirModal()">📁 新建文件夹</button>
        <button class="toolbar-btn logout" onclick="logout()">🚪 退出</button>
      </div>
      <div id="file-list"></div>
    </div>
  </div>

  <div id="mkdir-modal" class="modal">
    <div class="modal-content">
      <h3 class="modal-title">📁 新建文件夹</h3>
      <input type="text" id="mkdir-input" class="modal-input" placeholder="输入文件夹名称">
      <div class="modal-buttons">
        <button class="modal-btn cancel" onclick="closeMkdirModal()">取消</button>
        <button class="modal-btn confirm" onclick="createFolder()">创建</button>
      </div>
    </div>
  </div>

  <div id="delete-modal" class="modal">
    <div class="modal-content">
      <h3 class="modal-title">⚠️ 确认删除</h3>
      <p style="margin-bottom: 20px; color: #666;">确定要删除文件 "<span id="delete-filename"></span>" 吗？此操作不可恢复。</p>
      <div class="modal-buttons">
        <button class="modal-btn cancel" onclick="closeDeleteModal()">取消</button>
        <button class="modal-btn danger" onclick="confirmDelete()">删除</button>
      </div>
    </div>
  </div>

  <script>
    let requirePassword = ${requirePassword};
    let currentFolder = '';
    let deleteKey = '';

    async function checkAuth() {
      if (!requirePassword) {
        showMainPage();
        return;
      }
      try {
        const res = await fetch('/api/verify');
        const data = await res.json();
        if (data.authenticated) {
          showMainPage();
        } else {
          showLoginPage();
        }
      } catch {
        showLoginPage();
      }
    }

    function showLoginPage() {
      document.getElementById('login-page').style.display = 'block';
      document.getElementById('main-page').style.display = 'none';
    }

    function showMainPage() {
      document.getElementById('login-page').style.display = 'none';
      document.getElementById('main-page').style.display = 'block';
      loadFiles();
    }

    async function login() {
      const password = document.getElementById('password-input').value;
      const errorEl = document.getElementById('login-error');
      errorEl.textContent = '';
      
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success) {
          showMainPage();
        } else {
          errorEl.textContent = data.error || '密码错误';
        }
      } catch {
        errorEl.textContent = '登录失败，请重试';
      }
    }

    async function logout() {
      await fetch('/api/logout');
      if (requirePassword) {
        showLoginPage();
      }
    }

    async function loadFiles() {
      const listEl = document.getElementById('file-list');
      listEl.innerHTML = '<div class="loading">加载中...</div>';
      
      try {
        const res = await fetch('/api/list');
        if (res.status === 401) {
          if (requirePassword) showLoginPage();
          return;
        }
        const files = await res.json();
        
        const folders = new Set();
        const filteredFiles = [];
        
        files.forEach(file => {
          const parts = file.key.split('/');
          if (parts.length > 1) {
            folders.add(parts[0]);
          }
          if (!currentFolder || file.key.startsWith(currentFolder + '/')) {
            filteredFiles.push(file);
          }
        });
        
        updateFolderSelect(folders);
        renderFiles(filteredFiles);
      } catch (error) {
        listEl.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><p>加载失败: ' + escapeHtml(error.message) + '</p></div>';
      }
    }

    function updateFolderSelect(folders) {
      const select = document.getElementById('folder-select');
      const currentValue = select.value;
      select.innerHTML = '<option value="">根目录</option>';
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder;
        option.textContent = '📁 ' + folder;
        select.appendChild(option);
      });
      select.value = currentFolder;
    }

    function changeFolder() {
      currentFolder = document.getElementById('folder-select').value;
      loadFiles();
    }

    function renderFiles(files) {
      const listEl = document.getElementById('file-list');
      
      if (files.length === 0) {
        listEl.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>' + (currentFolder ? '文件夹为空' : '存储桶为空，暂无文件') + '</p></div>';
        return;
      }
      
      const displayFiles = files.filter(f => !f.key.endsWith('/.keep'));
      
      if (displayFiles.length === 0) {
        listEl.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>文件夹为空</p></div>';
        return;
      }
      
      const fileList = displayFiles.map(file => {
        const displayName = currentFolder ? file.key.replace(currentFolder + '/', '') : file.key;
        return '<tr>' +
          '<td class="filename">' + escapeHtml(displayName) + '</td>' +
          '<td>' + formatBytes(file.size) + '</td>' +
          '<td>' + new Date(file.uploaded).toLocaleString() + '</td>' +
          '<td class="actions">' +
            '<a href="/download/' + encodeURIComponent(file.key) + '" class="download-btn">下载</a>' +
            '<button class="delete-btn" onclick="showDeleteModal(\\'' + escapeHtml(file.key).replace(/'/g, "\\\\'") + '\\')">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('');
      
      listEl.innerHTML = '<table><thead><tr><th>文件名</th><th>大小</th><th>上传时间</th><th>操作</th></tr></thead><tbody>' + fileList + '</tbody></table>';
    }

    async function uploadFile() {
      const input = document.getElementById('file-input');
      const files = input.files;
      if (!files.length) return;
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        if (currentFolder) formData.append('folder', currentFolder);
        
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          const data = await res.json();
          if (!data.success) {
            alert('上传失败: ' + data.error);
          }
        } catch (error) {
          alert('上传失败: ' + error.message);
        }
      }
      
      input.value = '';
      loadFiles();
    }

    function showMkdirModal() {
      document.getElementById('mkdir-input').value = '';
      document.getElementById('mkdir-modal').classList.add('active');
      document.getElementById('mkdir-input').focus();
    }

    function closeMkdirModal() {
      document.getElementById('mkdir-modal').classList.remove('active');
    }

    async function createFolder() {
      const name = document.getElementById('mkdir-input').value.trim();
      if (!name) {
        alert('请输入文件夹名称');
        return;
      }
      
      const path = currentFolder ? currentFolder + '/' + name : name;
      
      try {
        const res = await fetch('/api/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });
        const data = await res.json();
        if (data.success) {
          closeMkdirModal();
          loadFiles();
        } else {
          alert('创建失败: ' + data.error);
        }
      } catch (error) {
        alert('创建失败: ' + error.message);
      }
    }

    function showDeleteModal(key) {
      deleteKey = key;
      document.getElementById('delete-filename').textContent = key;
      document.getElementById('delete-modal').classList.add('active');
    }

    function closeDeleteModal() {
      document.getElementById('delete-modal').classList.remove('active');
      deleteKey = '';
    }

    async function confirmDelete() {
      if (!deleteKey) return;
      
      try {
        const res = await fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: deleteKey })
        });
        const data = await res.json();
        if (data.success) {
          closeDeleteModal();
          loadFiles();
        } else {
          alert('删除失败: ' + data.error);
        }
      } catch (error) {
        alert('删除失败: ' + error.message);
      }
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(text) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeMkdirModal();
        closeDeleteModal();
      }
    });

    checkAuth();
  </script>
</body>
</html>`;
}
