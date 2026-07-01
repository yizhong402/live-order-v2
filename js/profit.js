/* ===== profit.js — 毛利计算 ===== */

let profitSessionId = '';
let profitData = null;

function renderProfitPage(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">💰 毛利计算</div>
      <div class="form-group" style="max-width:400px;">
        <label class="form-label">选择场次</label>
        <div class="flex gap-1">
          <select class="input select flex-1" id="profitSessionSelect" onchange="onProfitSessionChange()">
            <option value="">请选择已结束场次...</option>
          </select>
          <button class="btn btn-primary" onclick="calculateProfit()">计算</button>
        </div>
      </div>
      <div id="profitEmpty">
        <div class="empty-state"><div class="empty-icon">💰</div><p>请选择场次后点击计算</p></div>
      </div>
      <div id="profitResult" style="display:none;">
        <div class="card-grid card-grid-4 mb-2" id="profitCards"></div>
        <div class="flex justify-between items-center mb-1">
          <span class="card-header" style="margin-bottom:0;">📋 SKU 成本明细</span>
          <button class="btn btn-outline btn-sm" onclick="exportProfitCSV()">导出CSV</button>
        </div>
        <div class="table-container" id="profitDetailTable"></div>
      </div>
    </div>
  `;
  loadProfitSessions();
}

async function loadProfitSessions() {
  try {
    const sessions = await loadAllSessions();
    const select = document.getElementById('profitSessionSelect');
    sessions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.title + ' (' + s.anchor + ')' + (s.status === 'active' ? ' [进行中]' : ' [已结束]');
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('加载场次列表失败:', e);
  }
}

function onProfitSessionChange() {
  profitSessionId = document.getElementById('profitSessionSelect').value;
}

async function calculateProfit() {
  if (!profitSessionId) { showToast('请选择场次', 'warning'); return; }
  try {
    const orders = await BaaS.list('orders', { filter: 'session_id|eq|' + profitSessionId }) || [];
    if (orders.length === 0) {
      document.getElementById('profitResult').style.display = 'none';
      document.getElementById('profitEmpty').innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>该场次暂无订单</p></div>';
      return;
    }
    const skuSales = {};
    let totalRevenue = 0;
    orders.forEach(o => {
      totalRevenue += (o.auction_price || 0);
      try {
        const skus = JSON.parse(o.skus_json || '[]');
        skus.forEach(s => { if (!skuSales[s.sku]) skuSales[s.sku] = 0; skuSales[s.sku] += (s.quantity || 1); });
      } catch (e) {}
    });
    const products = AppState.products || [];
    let totalCostCNY = 0, totalCostUSD = 0;
    const detailRows = Object.entries(skuSales).map(function(entry) {
      var sku = entry[0], qty = entry[1];
      var product = products.find(function(p) { return p.sku === sku; });
      var name = product ? product.name : sku;
      var unitCostCNY = product ? (product.price_cny || 0) : 0;
      var unitCostUSD = product ? (product.price_usd || 0) : 0;
      var costCNY = unitCostCNY * qty;
      var costUSD = unitCostUSD * qty;
      totalCostCNY += costCNY;
      totalCostUSD += costUSD;
      return { sku: sku, name: name, qty: qty, unitCostCNY: unitCostCNY, unitCostUSD: unitCostUSD, costCNY: costCNY, costUSD: costUSD };
    });
    var grossProfit = totalRevenue - totalCostUSD;
    var grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) : '0.00';
    profitData = { sessionId: profitSessionId, totalRevenue: totalRevenue, totalCostCNY: totalCostCNY, totalCostUSD: totalCostUSD, grossProfit: grossProfit, grossMargin: grossMargin, detailRows: detailRows };
    document.getElementById('profitEmpty').style.display = 'none';
    document.getElementById('profitResult').style.display = 'block';
    document.getElementById('profitCards').innerHTML =
      '<div class="stat-card"><div class="stat-value">' + formatUSD(totalRevenue) + '</div><div class="stat-label">💰 总收入</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + formatUSD(totalCostUSD) + '</div><div class="stat-label">📦 总成本</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + formatUSD(grossProfit) + '</div><div class="stat-label">📊 毛利</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + grossMargin + '%</div><div class="stat-label">📈 毛利率</div></div>';
    var tableRows = detailRows.map(function(d) {
      return '<tr>' +
        '<td style="font-family:var(--font-mono);">' + escapeHtml(d.sku) + '</td>' +
        '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(d.name) + '</td>' +
        '<td style="text-align:center;">' + d.qty + '</td>' +
        '<td style="text-align:right;">' + formatUSD(d.unitCostUSD) + '</td>' +
        '<td style="text-align:right;">' + formatUSD(d.costUSD) + '</td>' +
      '</tr>';
    }).join('');
    document.getElementById('profitDetailTable').innerHTML =
      '<table><thead><tr><th>SKU</th><th>名称</th><th style="text-align:center;">销量</th><th style="text-align:right;">采购价$</th><th style="text-align:right;">成本$</th></tr></thead><tbody>' +
      tableRows + '</tbody></table>';
  } catch (e) {
    console.error('计算毛利失败:', e);
    showToast('计算毛利失败: ' + e.message, 'error');
  }
}

function exportProfitCSV() {
  if (!profitData || !profitData.detailRows || profitData.detailRows.length === 0) { showToast('请先计算毛利', 'warning'); return; }
  var headers = ['SKU', '名称', '销量', '采购价$', '成本$'];
  var rows = profitData.detailRows.map(function(d) {
    return [d.sku, d.name, d.qty, (d.unitCostUSD / 100).toFixed(2), (d.costUSD / 100).toFixed(2)];
  });
  rows.push(['', '', '', '', '']);
  rows.push(['', '总收入', '', '', (profitData.totalRevenue / 100).toFixed(2)]);
  rows.push(['', '总成本', '', '', (profitData.totalCostUSD / 100).toFixed(2)]);
  rows.push(['', '毛利', '', '', (profitData.grossProfit / 100).toFixed(2)]);
  rows.push(['', '毛利率', '', '', profitData.grossMargin + '%']);
  exportCSV('profit_report', headers, rows);
  showToast('CSV 导出成功', 'success');
}
