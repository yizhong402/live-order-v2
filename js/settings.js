/* ===== settings.js — 系统设置 ===== */

function renderSettingsPage(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">🛠️ OMS 配置 — OAuth 2.0 三步授权</div>

      <!-- 第一步 -->
      <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;">
        <div style="font-weight:600;margin-bottom:8px;">第一步：获取授权码</div>
        <div class="form-group">
          <label class="form-label">WMS 域名</label>
          <input class="input" id="omsDomain" placeholder="https://wms.example.com" value="">
        </div>
        <div class="form-group">
          <label class="form-label">应用 ClientId</label>
          <input class="input" id="omsClientId" placeholder="your_client_id">
        </div>
        <div class="form-group">
          <label class="form-label">OMS 邮箱</label>
          <input class="input" type="email" id="omsEmail" placeholder="admin@example.com">
        </div>
        <div class="form-group">
          <label class="form-label">一次性 Token（用后失效）</label>
          <input class="input" id="omsToken" placeholder="输入一次性授权 Token">
        </div>
        <button class="btn btn-primary" onclick="step1Authorize()">🔑 获取授权码</button>
        <div id="step1Result" style="margin-top:8px;font-size:0.85rem;"></div>
      </div>

      <!-- 第二步 -->
      <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;">
        <div style="font-weight:600;margin-bottom:8px;">第二步：换取 AccessToken</div>
        <div class="form-group">
          <label class="form-label">ClientSecret</label>
          <input class="input" id="omsClientSecret" placeholder="your_client_secret">
        </div>
        <div class="form-group">
          <label class="form-label">授权码（第一步返回）</label>
          <input class="input" id="omsAuthCode" placeholder="粘贴第一步获取的授权码">
        </div>
        <button class="btn btn-primary" onclick="step2AccessToken()">🎫 获取 AccessToken</button>
        <div id="step2Result" style="margin-top:8px;font-size:0.85rem;"></div>
      </div>

      <!-- Token 状态 -->
      <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;">
        <div style="font-weight:600;margin-bottom:8px;">🔄 Token 状态</div>
        <div id="tokenStatus" style="font-size:0.85rem;">
          <span style="color:var(--text-secondary);">未授权</span>
        </div>
        <button class="btn btn-sm btn-outline mt-1" onclick="refreshTokenStatus()">🔄 刷新状态</button>
        <button class="btn btn-sm btn-warning mt-1" onclick="clearOMSTokens()">🗑 清除授权</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">🗄️ BaaS 配置</div>
      <div class="form-group">
        <label class="form-label">API 地址</label>
        <input class="input" id="baasApiUrl" value="https://baas.kuafuai.net/baas-api">
      </div>
      <div class="form-group">
        <label class="form-label">CODE_FLYING</label>
        <input class="input" id="baasCodeFlying" placeholder="baas_CJbcgwuf">
      </div>
    </div>

    <div class="card">
      <div class="card-header">🔄 手动同步</div>
      <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">通过 OMS API 拉取商品详情和库存数据，写入 BaaS。</p>
      <button class="btn btn-primary" id="manualSyncBtn2" onclick="triggerManualSync()">🔄 全量同步 OMS → BaaS</button>
      <div id="syncProgress2" style="display:none;margin-top:8px;">
        <div class="progress-bar"><div class="progress-fill" id="syncProgressFill2" style="width:0%"></div></div>
        <div id="syncLog2" style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;max-height:100px;overflow-y:auto;"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">⚠️ 预警设置</div>
      <div class="form-group" style="max-width:200px;">
        <label class="form-label">低库存阈值</label>
        <input class="input" type="number" id="lowStockThreshold" value="5" min="1">
        <span style="font-size:0.8rem;color:var(--text-secondary);">库存 ≤ 该值时触发低库存预警</span>
      </div>
    </div>

    <div class="card">
      <div class="card-header">🗑️ 数据管理</div>
      <div class="flex gap-1">
        <button class="btn btn-outline btn-sm" onclick="clearLocalCache()">清除本地缓存</button>
        <button class="btn btn-outline btn-sm" onclick="reloadFromBaaS()">强制从 BaaS 重新加载</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">ℹ️ 关于</div>
      <p style="font-size:0.85rem;">直播订单管理系统 V2.0.0</p>
      <p style="font-size:0.8rem;color:var(--text-secondary);">GitHub: yizhong402/live-order-v2</p>
    </div>

    <div class="flex gap-1 mt-2">
      <button class="btn btn-primary" onclick="saveAllSettings()">💾 保存设置</button>
    </div>
  `;

  loadCurrentSettings();
}

// ===== 加载当前设置 =====
async function loadCurrentSettings() {
  try {
    const settings = await BaaS.list('settings') || [];
    settings.forEach(s => {
      const el = document.getElementById(s.key);
      if (el) el.value = s.value;
    });

    // 加载 OMS Token 状态
    OMS.loadTokens();
    updateTokenStatus();
  } catch (e) {
    console.error('加载设置失败:', e);
  }
}

// ===== OAuth 第一步 =====
async function step1Authorize() {
  const domain = document.getElementById('omsDomain').value.trim();
  const clientId = document.getElementById('omsClientId').value.trim();
  const email = document.getElementById('omsEmail').value.trim();
  const token = document.getElementById('omsToken').value.trim();

  if (!domain || !clientId || !email || !token) {
    showToast('请填写所有必填字段', 'warning');
    return;
  }

  try {
    document.getElementById('step1Result').innerHTML = '<span style="color:var(--text-secondary);">正在获取授权码...</span>';
    const authCode = await OMS.authorize(domain, clientId, email, token);
    document.getElementById('omsAuthCode').value = authCode;
    document.getElementById('step1Result').innerHTML =
      '<span style="color:var(--success);">✅ 授权码已获取</span>';
    showToast('授权码获取成功', 'success');
  } catch (e) {
    document.getElementById('step1Result').innerHTML =
      '<span style="color:var(--danger);">❌ ' + escapeHtml(e.message) + '</span>';
    showToast('获取授权码失败: ' + e.message, 'error');
  }
}

// ===== OAuth 第二步 =====
async function step2AccessToken() {
  const clientId = document.getElementById('omsClientId').value.trim();
  const clientSecret = document.getElementById('omsClientSecret').value.trim();
  const authCode = document.getElementById('omsAuthCode').value.trim();

  if (!clientId || !clientSecret || !authCode) {
    showToast('请填写 ClientSecret 和授权码', 'warning');
    return;
  }

  try {
    document.getElementById('step2Result').innerHTML = '<span style="color:var(--text-secondary);">正在获取 AccessToken...</span>';
    const data = await OMS.getAccessToken(clientId, clientSecret, authCode);
    document.getElementById('step2Result').innerHTML =
      '<div style="color:var(--success);">✅ AccessToken 获取成功</div>' +
      '<div style="font-size:0.8rem;color:var(--text-secondary);">过期时间: ' + new Date(Date.now() + (data.expireIn || 7200) * 1000).toLocaleString() + '</div>';
    updateTokenStatus();
    showToast('AccessToken 获取成功', 'success');
  } catch (e) {
    document.getElementById('step2Result').innerHTML =
      '<span style="color:var(--danger);">❌ ' + escapeHtml(e.message) + '</span>';
    showToast('获取 AccessToken 失败: ' + e.message, 'error');
  }
}

// ===== Token 状态显示 =====
function updateTokenStatus() {
  const container = document.getElementById('tokenStatus');
  if (!container) return;
  if (OMS.isAuthorized()) {
    const expireDate = OMS._expireAt ? new Date(OMS._expireAt).toLocaleString() : '未知';
    container.innerHTML =
      '<span style="color:var(--success);">🟢 Token 有效</span><br>' +
      '<span style="font-size:0.8rem;">过期时间: ' + expireDate + '</span><br>' +
      '<span style="font-size:0.8rem;">UserID: ' + (OMS._userId || '-') + '</span>';
  } else {
    container.innerHTML = '<span style="color:var(--warning);">🟡 未授权或 Token 已过期</span>';
  }
}

function refreshTokenStatus() {
  OMS.loadTokens();
  updateTokenStatus();
  showToast('Token 状态已刷新', 'success');
}

function clearOMSTokens() {
  OMS.clearTokens();
  updateTokenStatus();
  showToast('OMS 授权已清除', 'success');
}

// ===== 保存所有设置 =====
async function saveAllSettings() {
  const settings = [
    { key: 'oms_domain', value: document.getElementById('omsDomain').value.trim() },
    { key: 'oms_client_id', value: document.getElementById('omsClientId').value.trim() },
    { key: 'oms_email', value: document.getElementById('omsEmail').value.trim() },
    { key: 'baas_api_url', value: document.getElementById('baasApiUrl').value.trim() },
    { key: 'baas_code_flying', value: document.getElementById('baasCodeFlying').value.trim() },
    { key: 'low_stock_threshold', value: document.getElementById('lowStockThreshold').value || '5' }
  ];

  try {
    for (const s of settings) {
      if (!s.value) continue;
      // 查找已有配置
      const existing = await BaaS.list('settings', { filter: 'key|eq|' + s.key });
      if (existing && existing.length > 0) {
        await BaaS.update('settings', existing[0].id, { value: s.value });
      } else {
        await BaaS.insert('settings', { key: s.key, value: s.value, updated_at: nowISO() });
      }
    }

    // 更新运行时状态
    const codeFlying = settings.find(s => s.key === 'baas_code_flying');
    if (codeFlying && codeFlying.value) {
      BaaS.headers['CODE_FLYING'] = codeFlying.value;
    }
    AppState.lowStockThreshold = parseInt(settings.find(s => s.key === 'low_stock_threshold')?.value) || 5;

    showToast('设置已保存', 'success');
  } catch (e) {
    showToast('保存设置失败: ' + e.message, 'error');
  }
}

// ===== 数据管理 =====
function clearLocalCache() {
  showConfirm('清除本地缓存', '确认清除所有本地缓存数据？这将清除热卖缓存、标题历史等，但不影响 BaaS 数据。', () => {
    Storage.clearAll();
    showToast('本地缓存已清除', 'success');
  });
}

function reloadFromBaaS() {
  showConfirm('强制重新加载', '确认从 BaaS 强制重新加载所有数据？这将清除本地商品缓存并重新加载。', async () => {
    try {
      AppState.products = [];
      Storage.remove('hot_sales_cache');
      const products = await BaaS.list('products') || [];
      AppState.products = products;
      Storage.set('products_cache', products);
      showToast('已从 BaaS 重新加载 ' + products.length + ' 条商品数据', 'success');
    } catch (e) {
      showToast('重新加载失败: ' + e.message, 'error');
    }
  });
}
