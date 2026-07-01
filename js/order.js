/* ===== order.js — 订单录入 ===== */

// 当前轮次 SKU 列表
let currentSkus = {};   // { sku: quantity }
let currentTitle = '';
let savingOrder = false;

// ===== 渲染订单录入页 =====
function renderOrderEntry(container) {
  restoreSession();
  container.innerHTML = `
    <div class="card-grid card-grid-2">
      <!-- 左侧：场次信息 + 竞拍配置 -->
      <div>
        <div class="card" id="orderSessionPanel">
          <div class="card-header">🎬 当前场次</div>
          <div id="orderSessionContent">
            <div class="form-group">
              <label class="form-label">选择场次</label>
              <select class="input select" id="orderSessionSelect" onchange="onOrderSessionChange(this.value)">
                <option value="">-- 请选择场次 --</option>
              </select>
            </div>
            <div class="flex gap-1" style="margin-bottom:12px;">
              <button class="btn btn-primary btn-sm" onclick="showCreateSessionModal()">＋ 创建场次</button>
            </div>
            <div id="orderSessionInfo" style="display:none;">
              <div style="font-size:0.85rem;color:var(--text-secondary);">
                🎤 <span id="orderSessionAnchor">-</span> · 第 <span id="orderSessionRound">1</span> 轮
              </div>
              <div class="flex gap-1 mt-1">
                <button class="btn btn-sm btn-outline" onclick="changeOrderRound(-1)" title="上一轮">◀</button>
                <span id="orderCurrentRound" style="font-weight:600;">1</span>
                <button class="btn btn-sm btn-outline" onclick="changeOrderRound(1)" title="下一轮">▶</button>
                <button class="btn btn-sm btn-outline" onclick="resetOrderRound()" title="重置轮次">↺</button>
              </div>
              <div class="flex gap-1 mt-1">
                <button class="btn btn-sm btn-warning" onclick="endOrderSession()">🚫 结束直播</button>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">💰 竞拍配置</div>
          <div class="form-group">
            <label class="form-label">竞拍链接名称</label>
            <div class="flex gap-1">
              <input class="input flex-1" id="orderLinkName" placeholder="例如: kawaii bundle 1LB" onchange="currentTitle = this.value">
              <select class="input select" id="orderTitleHistory" onchange="document.getElementById('orderLinkName').value=this.value;currentTitle=this.value" style="max-width:200px;">
                <option value="">历史链接...</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">竞拍金额 ($)</label>
            <input class="input" type="number" id="auctionPrice" placeholder="0" min="0" step="0.01">
          </div>
          <div class="form-group">
            <label class="form-label">订单备注</label>
            <input class="input" id="orderNote" placeholder="输入备注信息（选填）">
          </div>
          <button class="btn btn-outline btn-sm" onclick="showManageTitleHistory()">📋 管理历史链接</button>
        </div>
      </div>

      <!-- 右侧：SKU 扫描区 + 实时订单列表 -->
      <div>
        <div class="card">
          <div class="card-header">🎯 SKU 扫描区</div>
          <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px;">准备好扫码枪，将光标放在输入框中扫描</p>
          <div class="flex gap-1 mb-1">
            <input class="input flex-1" id="scanInput" placeholder="扫描 SKU 码..." onkeydown="if(event.key==='Enter'){addScannedSKU();event.preventDefault();}">
            <button class="btn btn-primary" onclick="addScannedSKU()">添加SKU</button>
          </div>
          <div id="currentSkuList" style="margin:8px 0;">
            <div class="empty-state"><div class="empty-icon">📋</div><p>暂无SKU，请扫描商品条码</p></div>
          </div>
          <div class="flex gap-1">
            <button class="btn btn-success" id="saveOrderBtn" onclick="saveOrder()">💾 保存当前轮次订单</button>
            <button class="btn btn-outline" onclick="clearCurrentSkus()">🗑 清空当前轮次SKU</button>
          </div>
          <div id="scanIndicator" style="margin-top:8px;"></div>
        </div>
      </div>
    </div>

    <!-- 实时订单列表 -->
    <div class="card mt-2">
      <div class="card-header flex justify-between items-center">
        <span>📋 实时订单记录</span>
        <div class="flex gap-1 items-center">
          <span style="font-size:0.85rem;">轮次:</span>
          <input class="input" type="number" id="roundFilter" placeholder="全部" min="1" style="width:80px;" onchange="filterOrdersByRound()">
          <button class="btn btn-sm btn-outline" onclick="clearOrderFilter()">清除筛选</button>
          <select class="input select" id="orderAnchorFilter" onchange="filterOrdersByRound()" style="width:120px;">
            <option value="">全部主播</option>
          </select>
          <button class="btn btn-sm btn-outline" onclick="exportOrdersCSV()">导出CSV</button>
          <button class="btn btn-sm btn-danger" onclick="clearAllOrders()">清空所有订单</button>
        </div>
      </div>
      <div class="table-container" id="realtimeOrderList">
        <div class="empty-state"><div class="empty-icon">📋</div><p>请先选择或创建直播场次</p></div>
      </div>
    </div>
  `;

  loadOrderSessions();
}

// ===== 加载场次下拉框 =====
async function loadOrderSessions() {
  const select = document.getElementById('orderSessionSelect');
  try {
    const sessions = await loadAllSessions();
    sessions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.title} (${s.anchor})`;
      select.appendChild(opt);
    });

    // 恢复上次场次
    const saved = AppState.currentSession;
    if (saved && saved.status === 'active') {
      select.value = saved.id;
      await onOrderSessionChange(saved.id);
    }
  } catch (e) {
    console.error('加载场次列表失败:', e);
  }
}

// ===== 选择场次 =====
async function onOrderSessionChange(sessionIdStr) {
  if (!sessionIdStr) {
    document.getElementById('orderSessionInfo').style.display = 'none';
    document.getElementById('realtimeOrderList').innerHTML = '<div class=\"empty-state\"><div class=\"empty-icon\">📋</div><p>请先选择或创建直播场次</p></div>';
    return;
  }
  const sessionId = parseInt(sessionIdStr);
  const session = await selectSession(sessionId);
  if (!session) {
    showToast('场次加载失败', 'error');
    return;
  }
  document.getElementById('orderSessionInfo').style.display = 'block';
  document.getElementById('orderSessionAnchor').textContent = session.current_anchor || session.anchor;
  document.getElementById('orderSessionRound').textContent = session.current_round || 1;
  document.getElementById('orderCurrentRound').textContent = session.current_round || 1;
  loadOrderTitleHistory();
  refreshOrderList();
}

// ===== 创建场次弹窗 =====
function showCreateSessionModal() {
  const body = `
    <div class="form-group"><label class="form-label">场次标题</label><input class="input" id="newSessionTitle" placeholder="例如: 0620晚场"></div>
    <div class="form-group"><label class="form-label">日期</label><input class="input" type="date" id="newSessionDate"></div>
    <div class="form-group"><label class="form-label">时间</label><input class="input" type="time" id="newSessionTime"></div>
    <div class="form-group"><label class="form-label">主播</label><input class="input" id="newSessionAnchor" placeholder="例如: 小艺测试A"></div>
  `;
  const footer = `<button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doCreateSession()">创建</button>`;
  showModal('创建直播场次', body, footer);
}

async function doCreateSession() {
  const title = document.getElementById('newSessionTitle').value.trim();
  const date = document.getElementById('newSessionDate').value;
  const time = document.getElementById('newSessionTime').value;
  const anchor = document.getElementById('newSessionAnchor').value.trim();
  if (!title || !date || !anchor) {
    showToast('请填写场次标题、日期和主播', 'warning');
    return;
  }
  try {
    const session = await createSession(title, date, time, anchor);
    closeModal();
    // 刷新下拉框
    const select = document.getElementById('orderSessionSelect');
    const opt = document.createElement('option');
opt.value = session.id;
    opt.textContent = `${title} (${anchor})`;
    select.appendChild(opt);
    select.value = session.id;
    await onOrderSessionChange(session.id);
    showToast('场次创建成功', 'success');
  } catch (e) {
    showToast('创建场次失败', 'error');
  }
}

// ===== SKU 扫描 =====
async function addScannedSKU() {
  if (!AppState.currentSession) {
    showToast('请先选择或创建场次', 'warning');
    return;
  }
  const input = document.getElementById('scanInput');
  const sku = input.value.trim().toUpperCase();
  if (!sku) return;
  input.value = '';
  input.focus();

  // 检查是否是组合码
  try {
    const combos = await BaaS.list('combo_skus');
    const combo = combos?.find(c => c.code === sku);
    if (combo) {
      try {
        const subSkus = JSON.parse(combo.skus_json);
        subSkus.forEach(s => {
          addSKUToCurrentList(s.sku, s.qty || 1);
        });
        showToast(`组合 ${sku} 已展开为 ${subSkus.length} 个 SKU`, 'success');
        return;
      } catch (e) {}
    }
  } catch (e) {}

  // 单品 SKU
  addSKUToCurrentList(sku, 1);
}

function addSKUToCurrentList(sku, qty) {
  if (!AppState.products || AppState.products.length === 0) {
    currentSkus[sku] = (currentSkus[sku] || 0) + qty;
    renderCurrentSkuList();
    return;
  }
  currentSkus[sku] = (currentSkus[sku] || 0) + qty;
  renderCurrentSkuList();
}

function updateSkuQty(sku, delta) {
  currentSkus[sku] = (currentSkus[sku] || 0) + delta;
  if (currentSkus[sku] <= 0) delete currentSkus[sku];
  renderCurrentSkuList();
}

function removeSkuFromCurrent(sku) {
  delete currentSkus[sku];
  renderCurrentSkuList();
}

function clearCurrentSkus() {
  currentSkus = {};
  renderCurrentSkuList();
}

function renderCurrentSkuList() {
  const container = document.getElementById('currentSkuList');
  const skuKeys = Object.keys(currentSkus);
  if (skuKeys.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无SKU，请扫描商品条码</p></div>';
    return;
  }
  let html = '';
  skuKeys.forEach(sku => {
    const qty = currentSkus[sku];
    const product = AppState.products?.find(p => p.sku === sku);
    const name = product ? product.name : sku;
    const stock = product ? product.stock : '?';
    const priceCNY = product ? formatCNY(product.price_cny) : '?';
    const priceUSD = product ? formatUSD(product.price_usd) : '?';
    html += `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-color);">
        <span style="font-weight:600;">[${qty}]</span>
        <span style="font-family:var(--font-mono);">${escapeHtml(sku)}</span>
        <span style="color:var(--text-secondary);font-size:0.85rem;">库存: ${stock} | ${priceCNY} / ${priceUSD}</span>
        <div style="margin-left:auto;display:flex;gap:4px;">
          <button class="btn btn-sm btn-outline" onclick="updateSkuQty('${escapeHtml(sku)}', -1)">-</button>
          <span style="min-width:20px;text-align:center;">${qty}</span>
          <button class="btn btn-sm btn-outline" onclick="updateSkuQty('${escapeHtml(sku)}', 1)">+</button>
          <button class="btn btn-sm btn-danger" onclick="removeSkuFromCurrent('${escapeHtml(sku)}')">🗑</button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

// ===== 保存订单 =====
async function saveOrder() {
  if (!AppState.currentSession) {
    showToast('请先选择或创建场次', 'warning');
    return;
  }
  const skuKeys = Object.keys(currentSkus);
  if (skuKeys.length === 0) {
    showToast('请先扫描至少一个 SKU', 'warning');
    return;
  }
  if (savingOrder) return;
  savingOrder = true;

  try {
    const baseTitle = currentTitle || document.getElementById('orderLinkName').value.trim() || '';
    const auctionPrice = parseFloat(document.getElementById('auctionPrice').value) || 0;
    const note = document.getElementById('orderNote').value.trim();

    // 添加到标题历史
    if (baseTitle) addToTitleHistory(baseTitle);

    const skuItems = skuKeys.map(sku => ({
      sku, quantity: currentSkus[sku]
    }));

    // 超卖检测
    const oversoldSkus = [];
    for (const sku of skuKeys) {
      const product = AppState.products?.find(p => p.sku === sku);
      if (product && product.stock < currentSkus[sku]) {
        oversoldSkus.push(`${sku}(库存:${product.stock}, 需求:${currentSkus[sku]})`);
      }
    }

    let isOversold = false;
    if (oversoldSkus.length > 0) {
      isOversold = true;
      // 弹确认窗
      const confirmed = await new Promise(resolve => {
        showConfirm('⚠️ 超卖警告',
          `以下商品已超卖（库存不足）：\n${oversoldSkus.join('\\n')}\n\n是否仍要保存？`,
          () => resolve(true)
        );
        document.querySelector('#modalOverlay .btn-outline').onclick = () => { closeModal(); resolve(false); };
      });
      if (!confirmed) { savingOrder = false; return; }
    }

    const order = {
      round: AppState.currentSession.current_round || 1,
      title: baseTitle ? `${baseTitle} 第 ${AppState.currentSession.current_round || 1} 轮` : `${AppState.currentSession.title} R${AppState.currentSession.current_round || 1}#`,
      anchor: AppState.currentSession.current_anchor || AppState.currentSession.anchor,
      auction_price: Math.round(auctionPrice * 100),
      is_oversold: isOversold,
      note,
      skus_json: JSON.stringify(skuItems),
      session_id: AppState.currentSession.id,
      created_at: nowISO()
    };

    // 写 BaaS
    const result = await BaaS.insert('orders', order);
    order.id = typeof result === 'number' ? result : (result?.id || result);

    // 虚拟扣库存
    for (const sku of skuKeys) {
      const product = AppState.products?.find(p => p.sku === sku);
      if (product) {
        product.stock -= currentSkus[sku];
        try {
          await BaaS.update('products', product.id, { stock: product.stock });
        } catch (e) {}
      }
    }

    // 更新场次轮次
    if (AppState.currentSession.current_round) {
      const newRound = (AppState.currentSession.current_round || 1) + 1;
      await updateRound(newRound);
      document.getElementById('orderCurrentRound').textContent = newRound;
    }
Zustate.clearCurrentSkus();
    document.getElementById('auctionPrice').value = '';
    document.getElementById('orderNote').value = '';
    document.getElementById('scanInput').focus();

    document.getElementById('scanIndicator').innerHTML = '<p style="color:var(--success);">✅ ' + escapeHtml(order.title) + ' 已保存！</p>';

    await refreshOrderList();
    // 更新首页数据
    if (AppState.currentSection === 'home') loadHomeData();
  } catch (e) {
    console.error('保存订单失败:', e);
    showToast('保存订单失败: ' + e.message, 'error');
  } finally {
    savingOrder = false;
  }
}

// ===== 刷新实时订单列表 =====
async function refreshOrderList() {
  if (!AppState.currentSession) return;
  try {
    const orders = await BaaS.list('orders', {
      filter: `session_id|eq|${AppState.currentSession.id}`,
      orderBy: 'id',
      orderDir: 'desc'
    }) || [];
    renderOrderList(orders);
  } catch (e) {
    console.error('加载订单列表失败:', e);
  }
}

function renderOrderList(orders) {
  const container = document.getElementById('realtimeOrderList');
  if (!orders || orders.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无订单记录</p></div>';
    return;
  }

  const roundFilter = parseInt(document.getElementById('roundFilter')?.value) || 0;
  const anchorFilter = document.getElementById('orderAnchorFilter')?.value || '';
  let filtered = orders;
  if (roundFilter > 0) filtered = filtered.filter(o => o.round === roundFilter);
  if (anchorFilter) filtered = filtered.filter(o => o.anchor === anchorFilter);

  const rows = filtered.map(o => {
    let skuInfo = '';
    try {
      const skus = JSON.parse(o.skus_json || '[]');
      skuInfo = skus.map(s => `${s.sku} x${s.quantity || 1}`).join(', ');
    } catch (e) {}
    const price = o.auction_price ? formatUSD(o.auction_price) : '-';
    const time = o.created_at ? o.created_at.slice(5, 16) : '-';
    const oversoldBadge = o.is_oversold ? '<span class="badge badge-danger">⚠️ 超卖</span>' : '';
    const noteIcon = o.note ? ' 📝' : '';
    return `<tr>
      <td style="font-size:0.8rem;color:var(--text-secondary);">${escapeHtml(time)}</td>
      <td>${escapeHtml(o.title || '-')} ${oversoldBadge}${noteIcon}</td>
      <td style="font-size:0.8rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(skuInfo)}</td>
      <td style="text-align:right;">${price}</td>
      <td>${escapeHtml(o.anchor || '-')}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="copyOrderTitle('${escapeHtml(o.title || '')}')" title="复制标题">📋</button>
        <button class="btn btn-sm btn-danger" onclick="deleteOrderById(${o.id})" title="删除">🗑</button>
      </td>
    </tr>`;
  }).join('');

  // 收集锚点列表
  const anchors = [...new Set(orders.map(o => o.anchor).filter(Boolean))];
  const anchorSelect = document.getElementById('orderAnchorFilter');
  if (anchorSelect) {
    anchorSelect.innerHTML = '<option value="">全部主播</option>' +
      anchors.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
  }

  container.innerHTML = `
    <table>
      <thead><tr><th>时间</th><th>标题</th><th>SKU 详情</th><th style="text-align:right;">金额</th><th>主播</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="text-align:center;margin-top:6px;color:var(--text-secondary);font-size:0.8rem;">共 ${filtered.length} 条</div>
  `;
}

// ===== 轮次管理 =====
async function changeOrderRound(delta) {
  if (!AppState.currentSession) return;
  const newRound = Math.max(1, (AppState.currentSession.current_round || 1) + delta);
  await updateRound(newRound);
  document.getElementById('orderCurrentRound').textContent = newRound;
  document.getElementById('orderSessionRound').textContent = newRound;
}

async function resetOrderRound() {
  if (!AppState.currentSession) return;
  await updateRound(1);
  document.getElementById('orderCurrentRound').textContent = '1';
  document.getElementById('orderSessionRound').textContent = '1';
}

// ===== 筛选 =====
function filterOrdersByRound() {
  refreshOrderList();
}

function clearOrderFilter() {
  document.getElementById('roundFilter').value = '';
  if (document.getElementById('orderAnchorFilter')) document.getElementById('orderAnchorFilter').value = '';
  refreshOrderList();
}

// ===== 删除 =====
async function deleteOrderById(id) {
  showConfirm('删除订单', '确认删除该订单？库存将回滚。', async () => {
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
              product.stock += (s.quantity || 1);
              try { await BaaS.update('products', product.id, { stock: product.stock }); } catch (e) {}
            }
          }
        } catch (e) {}
      }
      await BaaS.delete('orders', id);
      showToast('订单已删除', 'success');
      await refreshOrderList();
    } catch (e) {
      showToast('删除订单失败', 'error');
    }
  });
}

function copyOrderTitle(title) {
  if (!title) return;
  document.getElementById('orderLinkName').value = title;
  currentTitle = title;
  showToast('标题已复制到竞拍链接名称', 'success');
}

// ===== 标题历史管理 =====
let titleHistory = [];

function loadOrderTitleHistory() {
  const saved = Storage.get('title_history');
  titleHistory = saved || [];
  renderTitleHistorySelect();
}

function addToTitleHistory(title) {
  if (!title || titleHistory.includes(title)) return;
  titleHistory.unshift(title);
  if (titleHistory.length > 50) titleHistory = titleHistory.slice(0, 50);
  Storage.set('title_history', titleHistory);
  renderTitleHistorySelect();
}

function renderTitleHistorySelect() {
  const select = document.getElementById('orderTitleHistory');
  if (!select) return;
  select.innerHTML = '<option value="">历史链接...</option>' +
    titleHistory.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
}

function showManageTitleHistory() {
  const items = titleHistory.map((t, i) => `
    <div class="flex justify-between items-center" style="padding:4px 0;border-bottom:1px solid var(--border-color);">
      <span>${escapeHtml(t)}</span>
      <button class="btn btn-sm btn-danger" onclick="removeTitleHistory(${i})">✕</button>
    </div>
  `).join('') || '<p style="color:var(--text-secondary);">暂无历史链接</p>';

  showModal('📋 管理历史链接', `<div style="max-height:300px;overflow-y:auto;">${items}</div>`,
    '<button class="btn btn-outline btn-sm" onclick="clearTitleHistory()">清空全部</button><button class="btn btn-primary btn-sm" onclick="closeModal()">关闭</button>');
}

function removeTitleHistory(index) {
  titleHistory.splice(index, 1);
  Storage.set('title_history', titleHistory);
  renderTitleHistorySelect();
  showManageTitleHistory();
}

function clearTitleHistory() {
  titleHistory = [];
  Storage.set('title_history', []);
  renderTitleHistorySelect();
  showManageTitleHistory();
}

// ===== 结束场次 =====
async function endOrderSession() {
  showConfirm('结束直播', '确认结束当前场次？已结束的场次将不能在订单录入页选择。', async () => {
    await endSession();
    document.getElementById('orderSessionSelect').value = '';
    document.getElementById('orderSessionInfo').style.display = 'none';
    document.getElementById('realtimeOrderList').innerHTML = '<div class=\"empty-state\"><div class=\"empty-icon\">📋</div><p>场次已结束</p></div>';
    showToast('场次已结束', 'success');
  });
}

// ===== 导出 CSV =====
async function exportOrdersCSV() {
  if (!AppState.currentSession) return;
  try {
    const orders = await BaaS.list('orders', {
      filter: `session_id|eq|${AppState.currentSession.id}`,
      orderBy: 'id', orderDir: 'asc'
    }) || [];
    const headers = ['时间', '标题', 'SKU详情', '数量', '竞拍价($)', '主播', '超卖', '备注'];
    const rows = orders.map(o => {
      let skuStr = '', totalQty = 0;
      try {
        const skus = JSON.parse(o.skus_json || '[]');
        skuStr = skus.map(s => `${s.sku} x${s.quantity || 1}`).join('; ');
        totalQty = skus.reduce((sum, s) => sum + (s.quantity || 1), 0);
      } catch (e) {}
      return [
        o.created_at || '', o.title || '', skuStr, totalQty,
        o.auction_price ? (o.auction_price / 100).toFixed(2) : '0',
        o.anchor || '', o.is_oversold ? '是' : '否', o.note || ''
      ];
    });
    exportCSV(`orders_session_${AppState.currentSession.id}`, headers, rows);
    showToast('CSV 导出成功', 'success');
  } catch (e) {
    showToast('导出失败', 'error');
  }
}

// ===== 清空所有订单 =====
function clearAllOrders() {
  showConfirm('清空所有订单', '确认删除当前场次的所有订单？此操作不可恢复！', async () => {
    try {
      const orders = await BaaS.list('orders', {
        filter: `session_id|eq|${AppState.currentSession.id}`
      }) || [];
      for (const o of orders) {
        // 回滚库存
        try {
          const skus = JSON.parse(o.skus_json || '[]');
          for (const s of skus) {
            const product = AppState.products?.find(p => p.sku === s.sku);
            if (product) {
              product.stock += (s.quantity || 1);
              try { await BaaS.update('products', product.id, { stock: product.stock }); } catch (e) {}
            }
          }
        } catch (e) {}
        await BaaS.delete('orders', o.id);
      }
      showToast(`已删除 ${orders.length} 条订单`, 'success');
      await refreshOrderList();
    } catch (e) {
      showToast('清空订单失败', 'error');
    }
  });
}
