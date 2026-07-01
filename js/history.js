/* ===== history.js — 历史记录 ===== */

let historySessionsList = [];
let historyCurrentSessionId = '';
let historyDateStart = '';
let historyDateEnd = '';
let historyPageNum = 1;
const historyPageSize = 30;

// ===== 渲染历史记录页 =====
function renderHistoryPage(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header flex justify-between items-center mb-2" style="margin-bottom:0;">
        <span>📜 历史订单记录</span>
        <button class="btn btn-outline btn-sm" onclick="exportHistoryCSV()">导出CSV</button>
      </div>
      <div class="search-bar">
        <span style="font-size:0.85rem;">🎬 场次:</span>
        <select class="input select" id="historySessionSelect" onchange="onHistorySessionChange()" style="width:220px;">
          <option value="">全部场次</option>
        </select>
        <span style="font-size:0.85rem;">📅 从</span>
        <input class="input" type="date" id="historyDateStart" onchange="onHistoryDateChange()" style="width:140px;">
        <span style="font-size:0.85rem;">到</span>
        <input class="input" type="date" id="historyDateEnd" onchange="onHistoryDateChange()" style="width:140px;">
        <button class="btn btn-sm btn-primary" onclick="filterHistory()">🔍 查询</button>
      </div>
      <div class="table-container" id="historyTableContainer">
        <div class="empty-state"><div class="spinner"></div><p>加载中...</p></div>
      </div>
      <div id="historyPagination"></div>
    </div>
  `;
  loadHistorySessions();
  loadHistoryOrders();
}

// ===== 加载历史场次下拉 =====
async function loadHistorySessions() {
  try {
    const sessions = await loadAllSessions();
    historySessionsList = sessions || [];
    const select = document.getElementById('historySessionSelect');
    sessions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.title} (${s.anchor}) ${s.status === 'ended' ? '[已结束]' : ''}`;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('加载历史场次失败:', e);
  }
}

// ===== 加载历史订单 =====
async function loadHistoryOrders() {
  try {
    let filter = null;
    if (historyCurrentSessionId) {
      filter = `session_id|eq|${historyCurrentSessionId}`;
    }

    const orders = await BaaS.list('orders', {
      filter,
      orderBy: 'id',
      orderDir: 'desc',
      limit: 2000
    }) || [];

    renderHistoryTable(orders);
  } catch (e) {
    console.error('加载历史订单失败:', e);
    document.getElementById('historyTableContainer').innerHTML =
      '<div class="empty-state"><div class="empty-icon">❌</div><p>加载失败</p></div>';
  }
}

function renderHistoryTable(allOrders) {
  const container = document.getElementById('historyTableContainer');

  // 日期筛选
  let filtered = allOrders;
  if (historyDateStart || historyDateEnd) {
    filtered = allOrders.filter(o => {
      const dateStr = (o.created_at || '').slice(0, 10);
      if (!dateStr) return false;
      if (historyDateStart && dateStr < historyDateStart) return false;
      if (historyDateEnd && dateStr > historyDateEnd) return false;
      return true;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无历史订单记录</p></div>';
    document.getElementById('historyPagination').innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / historyPageSize);
  if (historyPageNum > totalPages) historyPageNum = 1;
  const start = (historyPageNum - 1) * historyPageSize;
  const pageItems = filtered.slice(start, start + historyPageSize);

  const rows = pageItems.map(o => {
    let skuInfo = '';
    try {
      const skus = JSON.parse(o.skus_json || '[]');
      skuInfo = skus.map(s => `${s.sku} x${s.qty || 1}`).join(', ');
    } catch (e) {}
    const price = o.auction_price ? formatUSD(o.auction_price) : '-';
    const time = o.created_at ? o.created_at.slice(0, 16) : '-';
    const oversoldBadge = o.is_oversold ? '<span class="badge badge-danger">⚠️ 超卖</span>' : '';
    return `<tr>
      <td style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;">${escapeHtml(time)}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(o.title || '')}">${escapeHtml(o.title || '-')}</td>
      <td style="text-align:center;">${o.round || '-'}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(skuInfo)}</td>
      <td style="text-align:right;">${price}</td>
      <td>${escapeHtml(o.anchor || '-')}${oversoldBadge}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="toggleHistoryOrderDetail(${o.id})">▶ 展开</button>
        <button class="btn btn-sm btn-danger" onclick="deleteHistoryOrder(${o.id})">🗑</button>
      </td>
    </tr>
    <tr id="historyDetail${o.id}" style="display:none;">
      <td colspan="7" style="padding:0;">
        <div style="padding:8px 16px;background:rgba(0,0,0,0.2);" id="historyDetailContent${o.id}"></div>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead><tr>
        <th>时间</th><th>标题</th><th style="text-align:center;">轮次</th><th>SKU 详情</th><th style="text-align:right;">金额</th><th>主播</th><th>操作</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="text-align:center;margin-top:6px;color:var(--text-secondary);font-size:0.8rem;">共 ${filtered.length} 条</div>
  `;

  renderPagination('historyPagination', historyPageNum, totalPages, 'goHistoryPage');
}

function goHistoryPage(page) {
  historyPageNum = page;
  loadHistoryOrders();
}

// ===== 展开订单详情 =====
async function toggleHistoryOrderDetail(id) {
  const detailRow = document.getElementById(`historyDetail${id}`);
  if (detailRow.style.display === 'none' || detailRow.style.display === '') {
    detailRow.style.display = 'table-row';
    try {
      const orders = await BaaS.list('orders', { filter: `id|eq|${id}` });
      if (!orders || orders.length === 0) return;
      const order = orders[0];
      const skus = JSON.parse(order.skus_json || '[]');
      const products = AppState.products || [];
      const rows = skus.map(s => {
        const product = products.find(p => p.sku === s.sku);
        const name = product ? product.name : s.sku;
        const unitPrice = product ? formatUSD(product.price_usd) : '-';
        const subtotal = order.auction_price ? `—` : '-';
        return `<tr>
          <td style="font-family:var(--font-mono);">${escapeHtml(s.sku)}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}</td>
          <td style="text-align:center;">${s.qty || 1}</td>
          <td style="text-align:right;">${unitPrice}</td>
          <td style="text-align:right;">${subtotal}</td>
        </tr>`;
      }).join('');
      document.getElementById(`historyDetailContent${id}`).innerHTML = `
        <table>
          <thead><tr><th>SKU</th><th>名称</th><th style="text-align:center;">数量</th><th style="text-align:right;">参考单价</th><th style="text-align:right;">备注</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px;">💰 竞拍金额: ${order.auction_price ? formatUSD(order.auction_price) : '-'} | 📝 备注: ${escapeHtml(order.note || '无')}</div>
      `;
    } catch (e) {
      console.error('加载订单详情失败:', e);
    }
  } else {
    detailRow.style.display = 'none';
  }
}

// ===== 筛选 =====
function onHistorySessionChange() {
  historyCurrentSessionId = document.getElementById('historySessionSelect').value;
  historyPageNum = 1;
  loadHistoryOrders();
}

function onHistoryDateChange() {
  historyDateStart = document.getElementById('historyDateStart').value;
  historyDateEnd = document.getElementById('historyDateEnd').value;
}

function filterHistory() {
  onHistoryDateChange();
  historyPageNum = 1;
  loadHistoryOrders();
}

// ===== 删除历史订单 =====
function deleteHistoryOrder(id) {
  showConfirm('删除订单', '确认删除该历史订单？此操作不可恢复！', async () => {
    try {
      // 回滚库存
      const orders = await BaaS.list('orders', { filter: `id|eq|${id}` });
      if (orders && orders.length > 0) {
        const order = orders[0];
        try {
          const skus = JSON.parse(order.skus_json || '[]');
          for (const s of skus) {
            const product = AppState.products?.find(p => p.sku === s.sku);
            if (product) {
              product.stock += (s.qty || 1);
              try { await BaaS.update('products', product.id, { stock: product.stock }); } catch (e) {}
            }
          }
        } catch (e) {}
      }
      await BaaS.delete('orders', id);
      showToast('订单已删除', 'success');
      loadHistoryOrders();
    } catch (e) {
      showToast('删除订单失败', 'error');
    }
  });
}

// ===== 导出 CSV =====
async function exportHistoryCSV() {
  try {
    let filter = null;
    if (historyCurrentSessionId) {
      filter = `session_id|eq|${historyCurrentSessionId}`;
    }
    const orders = await BaaS.list('orders', { filter, orderBy: 'id', orderDir: 'asc' }) || [];
    const headers = ['时间', '场次', '轮次', '标题', 'SKU详情', '数量', '竞拍价($)', '主播', '超卖', '备注'];
    const rows = orders.map(o => {
      let skuStr = '', totalQty = 0;
      try {
        const skus = JSON.parse(o.skus_json || '[]');
        skuStr = skus.map(s => `${s.sku} x${s.quantity || 1}`).join('; ');
        totalQty = skus.reduce((sum, s) => sum + (s.quantity || 1), 0);
      } catch (e) {}
      return [
        o.created_at || '', o.title || '', o.round || '',
        skuStr, totalQty,
        o.auction_price ? (o.auction_price / 100).toFixed(2) : '0',
        o.anchor || '', o.is_oversold ? '是' : '否', o.note || ''
      ];
    });
    exportCSV('history_orders', headers, rows);
    showToast('CSV 导出成功', 'success');
  } catch (e) {
    showToast('导出失败', 'error');
  }
}
