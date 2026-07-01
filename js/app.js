/* ===== app.js — 全局入口：路由/导航/全局状态 ===== */

// ===== 全局状态 =====
const AppState = {
  currentSection: 'home',
  currentSession: null,
  products: [],
  hotSalesCache: null,
  lowStockThreshold: 5,
  warehouseCode: 'PA',
  warehouseName: '仓库',
  connectionStatus: true
};

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupNavigation();
  navigateTo(location.hash.slice(1) || 'home');
  checkBaaSConnection();
});

// ===== 导航 =====
function setupNavigation() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const section = tab.dataset.section;
      location.hash = section;
      navigateTo(section);
    });
  });
  window.addEventListener('hashchange', () => {
    navigateTo(location.hash.slice(1) || 'home');
  });
}

function navigateTo(section) {
  AppState.currentSection = section;
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.section === section);
  });
  document.querySelectorAll('.page-section').forEach(s => {
    s.classList.toggle('active', s.id === `section-${section}`);
  });
  renderSection(section);
}

// ===== 页面路由渲染 =====
function renderSection(section) {
  const container = document.getElementById(`section-${section}`);
  if (!container) return;
  switch (section) {
    case 'home': renderHome(container); break;
    case 'order': renderOrderEntry(container); break;
    case 'products': renderProductPage(container); break;
    case 'combo': renderComboPage(container); break;
    case 'hot': renderHotPage(container); break;
    case 'arrival': renderArrivalPage(container); break;
    case 'history': renderHistoryPage(container); break;
    case 'profit': renderProfitPage(container); break;
    case 'settings': renderSettingsPage(container); break;
  }
}

// ===== BaaS 连接检查 =====
async function checkBaaSConnection() {
  try {
    await BaaS.list('products', { limit: 1 });
    AppState.connectionStatus = true;
    document.getElementById('connectionStatus').className = 'status-dot online';
  } catch (e) {
    AppState.connectionStatus = false;
    document.getElementById('connectionStatus').className = 'status-dot offline';
  }
}

// ===== 加载设置 =====
async function loadSettings() {
  try {
    const settings = await BaaS.list('settings');
    if (settings && settings.length) {
      settings.forEach(s => {
        if (s.key === 'low_stock_threshold') AppState.lowStockThreshold = parseInt(s.value) || 5;
        if (s.key === 'baas_code_flying') BaaS.headers['CODE_FLYING'] = s.value;
      });
    }
    OMS.loadTokens();
    if (OMS.isAuthorized()) {
      try { const warehouses = await OMS.getWarehouseList(); if (warehouses && warehouses.length) { const pa = warehouses.find(w => w.code === 'PA' || w.name?.includes('PA')); if (pa) AppState.warehouseName = pa.name || 'PA仓库'; } } catch (e) {}
    }
    document.getElementById('warehouseLabel').textContent = AppState.warehouseName;
  } catch (e) {
    console.warn('加载设置失败:', e);
  }
}

// ===== 移动端菜单 =====
function toggleMobileMenu() {
  document.getElementById('navTabs').classList.toggle('open');
}

// 点击页面其他区域关闭移动菜单
document.addEventListener('click', (e) => {
  if (!e.target.closest('#navTabs') && !e.target.closest('#mobileMenuBtn')) {
    document.getElementById('navTabs').classList.remove('open');
  }
});

// ===== 首页 =====
async function renderHome(container) {
  container.innerHTML = `
    <div class="card-grid card-grid-3" id="homeStatCards">
      <div class="stat-card"><div class="spinner"></div></div>
      <div class="stat-card"><div class="spinner"></div></div>
      <div class="stat-card"><div class="spinner"></div></div>
    </div>
    <div class="card-grid card-grid-2">
      <div class="card" id="homeActiveSessions"><div class="card-header">🎬 活跃场次</div><div class="empty-state"><div class="spinner"></div></div></div>
      <div class="card" id="homeRecentOrders"><div class="card-header">📋 最近订单动态</div><div class="empty-state"><div class="spinner"></div></div></div>
    </div>
    <div class="card-grid card-grid-2">
      <div class="card" id="homeLowStock"><div class="card-header">⚠️ 低库存预警（阈值 ≤ ${AppState.lowStockThreshold}）</div><div class="empty-state"><div class="spinner"></div></div></div>
      <div class="card" id="homeHotPreview"><div class="card-header">🔥 热卖 Top 5</div><div class="empty-state"><div class="spinner"></div></div></div>
    </div>
    <div class="flex gap-2 justify-center mt-2">
      <button class="btn btn-primary btn-lg" onclick="navigateTo('order')">📝 订单录入</button>
      <button class="btn btn-success btn-lg" onclick="navigateTo('products')">📦 商品管理</button>
      <button class="btn btn-outline btn-lg" onclick="navigateTo('profit')">💰 毛利计算</button>
    </div>
  `;
  loadHomeData();
}

async function loadHomeData() {
  try {
    // 并行加载数据
    const [products, sessions, orders] = await Promise.all([
      BaaS.list('products').then(d => d || []),
      BaaS.list('live_sessions', { filter: 'status|eq|active' }).then(d => d || []),
      BaaS.list('orders', { orderBy: 'id', orderDir: 'desc', limit: 20 }).then(d => d || [])
    ]);

    AppState.products = products;
    renderStockOverview(products);
    renderActiveSessions(sessions);
    renderRecentOrders(orders);
    renderLowStockAlerts(products);
    renderHotPreview(orders, products);
  } catch (e) {
    console.error('首页数据加载失败:', e);
    showToast('首页数据加载失败，请检查 BaaS 连接', 'error');
  }
}

function renderStockOverview(products) {
  const totalProducts = products.length;
  const totalSKUs = [...new Set(products.map(p => p.sku))].length;
  const totalValueCNY = products.reduce((sum, p) => sum + (p.price_cny || 0) * (p.stock || 0), 0);

  document.getElementById('homeStatCards').innerHTML = `
    <div class="stat-card"><div class="stat-value">${totalProducts.toLocaleString()}</div><div class="stat-label">📦 商品总数</div></div>
    <div class="stat-card"><div class="stat-value">${totalSKUs.toLocaleString()}</div><div class="stat-label">🔢 SKU 种类</div></div>
    <div class="stat-card"><div class="stat-value">${formatCNY(totalValueCNY)}</div><div class="stat-label">💰 库存总值（按采购价）</div></div>
  `;
}

function renderActiveSessions(sessions) {
  const container = document.getElementById('homeActiveSessions');
  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<div class="card-header">🎬 活跃场次</div><div class="empty-state"><div class="empty-icon">📭</div><p>暂无活跃场次</p><p style="font-size:0.8rem;"><a href="#order" onclick="navigateTo(\'order\')">去创建场次 →</a></p></div>';
    return;
  }

  const session = sessions[0];
  const anchor = session.current_anchor || session.anchor || '-';
  container.innerHTML = `
    <div class="card-header">🎬 活跃场次</div>
    <div class="card" style="cursor:pointer;border-color:var(--accent);" onclick="navigateTo('order')">
      <div style="font-weight:600;font-size:1rem;margin-bottom:6px;">${escapeHtml(session.title)}</div>
      <div style="font-size:0.85rem;color:var(--text-secondary);">
        🎤 ${escapeHtml(anchor)} · 第 ${session.current_round || 1} 轮<br>
        📅 ${escapeHtml(session.date)} ${escapeHtml(session.time || '')}
      </div>
      <div style="margin-top:8px;"><span class="badge badge-success">● 直播中</span></div>
    </div>
    <div style="text-align:center;margin-top:6px;"><a href="#order" onclick="navigateTo('order')" style="font-size:0.8rem;">[点击进入订单录入]</a></div>
  `;
}

function renderRecentOrders(orders) {
  const container = document.getElementById('homeRecentOrders');
  if (!orders || orders.length === 0) {
    container.innerHTML = '<div class="card-header">📋 最近订单动态</div><div class="empty-state"><div class="empty-icon">📋</div><p>暂无订单</p></div>';
    return;
  }

  const rows = orders.slice(0, 10).map(o => {
    let skuInfo = '—';
    try {
      const skus = JSON.parse(o.skus_json || '[]');
      if (skus.length > 0) skuInfo = skus.map(s => `${s.sku} x${s.qty || 1}`).join(', ');
    } catch (e) {}
    const price = o.auction_price ? formatUSD(o.auction_price) : '-';
    const time = o.created_at ? o.created_at.slice(11, 16) : '-';
    return `<tr>
      <td style="font-size:0.8rem;color:var(--text-secondary);">${escapeHtml(time)}</td>
      <td>${escapeHtml(o.title || '-')}</td>
      <td style="font-size:0.8rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(skuInfo)}</td>
      <td style="text-align:right;">${price}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card-header">📋 最近订单动态</div>
    <div class="table-container">
      <table>
        <thead><tr><th>时间</th><th>标题</th><th>SKU</th><th style="text-align:right;">金额</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="text-align:center;margin-top:6px;"><a href="#history" onclick="navigateTo('history')" style="font-size:0.8rem;">查看全部历史记录 →</a></div>
  `;
}

function renderLowStockAlerts(products) {
  const container = document.getElementById('homeLowStock');
  const threshold = AppState.lowStockThreshold;
  const lowStockItems = products
    .filter(p => p.stock <= threshold)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 10);

  if (lowStockItems.length === 0) {
    container.innerHTML = '<div class="card-header">⚠️ 低库存预警（阈值 ≤ ' + threshold + '）</div><div class="empty-state"><div class="empty-icon">✅</div><p>所有商品库存正常</p></div>';
    return;
  }

  const rows = lowStockItems.map(p => {
    const badge = p.stock <= 0 ? '<span class="badge badge-danger">🔴 售罄</span>' : '<span class="badge badge-warning">🟡 低库存</span>';
    return `<tr class="clickable" onclick="navigateTo('products')">
      <td style="font-family:var(--font-mono);">${escapeHtml(p.sku)}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</td>
      <td style="text-align:center;"><strong>${p.stock}</strong></td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card-header">⚠️ 低库存预警（阈值 ≤ ${threshold}）</div>
    <div class="table-container">
      <table>
        <thead><tr><th>SKU</th><th>名称</th><th style="text-align:center;">库存</th><th>状态</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${lowStockItems.length >= 10 ? '<div style="text-align:center;margin-top:6px;"><a href="#products" onclick="navigateTo(\'products\')" style="font-size:0.8rem;">查看全部低库存商品 →</a></div>' : ''}
  `;
}

function renderHotPreview(orders, products) {
  const container = document.getElementById('homeHotPreview');

  if (!orders || orders.length === 0) {
    container.innerHTML = '<div class="card-header">🔥 热卖 Top 5</div><div class="empty-state"><div class="empty-icon">📊</div><p>暂无销售数据</p></div>';
    return;
  }

  // 从 orders 聚合销量
  const salesMap = {};
  orders.forEach(o => {
    try {
      const skus = JSON.parse(o.skus_json || '[]');
      skus.forEach(s => {
        const key = s.sku;
        salesMap[key] = (salesMap[key] || 0) + (s.qty || 1);
      });
    } catch (e) {}
  });

  // 排序取 Top 5
  const sorted = Object.entries(salesMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="card-header">🔥 热卖 Top 5</div><div class="empty-state"><div class="empty-icon">📊</div><p>暂无销售数据</p></div>';
    return;
  }

  const rows = sorted.map(([sku, qty], i) => {
    const product = products.find(p => p.sku === sku);
    const name = product ? product.name : sku;
    const stock = product ? product.stock : '-';
    const stockBadge = product ? stockStatusBadge(product.stock, AppState.lowStockThreshold) : '-';
    return `<tr class="clickable" onclick="navigateTo('hot')">
      <td style="font-weight:600;">#${i + 1}</td>
      <td style="font-family:var(--font-mono);">${escapeHtml(sku)}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}</td>
      <td style="text-align:center;font-weight:600;">${qty.toLocaleString()}</td>
      <td style="text-align:center;">${stock}</td>
      <td>${stockBadge}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card-header">🔥 热卖 Top 5</div>
    <div class="table-container">
      <table>
        <thead><tr><th>#</th><th>SKU</th><th>名称</th><th style="text-align:center;">销量</th><th style="text-align:center;">库存</th><th>状态</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="text-align:center;margin-top:6px;"><a href="#hot" onclick="navigateTo('hot')" style="font-size:0.8rem;">查看完整热卖排行 →</a></div>
  `;
}

// 占位函数（后续各模块实现）
function renderOrderEntry(container) { container.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🚧</div><p>订单录入模块开发中...</p></div></div>'; }
function renderProductPage(container) { container.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🚧</div><p>商品管理模块开发中...</p></div></div>'; }
function renderComboPage(container) { container.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🚧</div><p>组合SKU模块开发中...</p></div></div>'; }
function renderHotPage(container) { container.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🚧</div><p>热卖排行模块开发中...</p></div></div>'; }
function renderArrivalPage(container) { container.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🚧</div><p>新上架模块开发中...</p></div></div>'; }
function renderHistoryPage(container) { container.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🚧</div><p>历史记录模块开发中...</p></div></div>'; }
function renderProfitPage(container) { container.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🚧</div><p>毛利计算模块开发中...</p></div></div>'; }
function renderSettingsPage(container) { container.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">🚧</div><p>系统设置模块开发中...</p></div></div>'; }
