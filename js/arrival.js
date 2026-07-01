/* ===== arrival.js — 新上架 ===== */

let arrivalSearchKeyword = '';
let arrivalDateStart = '';
let arrivalDateEnd = '';
let arrivalPageNum = 1;
const arrivalPageSize = 50;
let arrivalData = [];

// ===== 渲染新上架页 =====
function renderArrivalPage(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header flex justify-between items-center mb-2" style="margin-bottom:0;">
        <span>🆕 新上架</span>
        <button class="btn btn-outline btn-sm" onclick="exportArrivalCSV()">导出CSV</button>
      </div>
      <div class="search-bar">
        <span style="font-size:0.85rem;color:var(--text-secondary);">📅 开始日期</span>
        <input class="input" type="date" id="arrivalDateStart" onchange="onArrivalDateChange()" style="width:150px;">
        <span style="font-size:0.85rem;color:var(--text-secondary);">📅 结束日期</span>
        <input class="input" type="date" id="arrivalDateEnd" onchange="onArrivalDateChange()" style="width:150px;">
        <button class="btn btn-sm btn-primary" onclick="filterArrivalByDate()">🔍 查询</button>
        <input class="input flex-1" id="arrivalSearch" placeholder="🔍 搜索 SKU/名称..." oninput="debouncedArrivalSearch()" style="max-width:250px;">
      </div>
      <div class="table-container" id="arrivalTableContainer">
        <div class="empty-state"><div class="spinner"></div><p>加载中...</p></div>
      </div>
      <div id="arrivalPagination"></div>
    </div>
  `;
  loadArrivalData();
}

// ===== 加载新上架数据 =====
async function loadArrivalData() {
  try {
    const products = await BaaS.list('products', { orderBy: 'last_restock_at', orderDir: 'desc' }) || [];
    arrivalData = products.map(p => ({
      sku: p.sku,
      name: p.name || '',
      stock: p.stock || 0,
      price_cny: p.price_cny || 0,
      price_usd: p.price_usd || 0,
      image_url: p.image_url || '',
      first_seen_at: p.first_seen_at || '',
      last_restock_at: p.last_restock_at || '',
      updated_at: p.updated_at || ''
    }));
    renderArrivalTable();
  } catch (e) {
    console.error('加载新上架数据失败:', e);
    document.getElementById('arrivalTableContainer').innerHTML =
      '<div class="empty-state"><div class="empty-icon">❌</div><p>加载失败</p></div>';
  }
}

function renderArrivalTable() {
  const container = document.getElementById('arrivalTableContainer');
  let data = arrivalData;

  // 搜索筛选
  if (arrivalSearchKeyword) {
    const kw = arrivalSearchKeyword.toLowerCase();
    data = data.filter(d =>
      d.sku.toLowerCase().includes(kw) ||
      d.name.toLowerCase().includes(kw)
    );
  }

  // 日期范围筛选
  if (arrivalDateStart || arrivalDateEnd) {
    data = data.filter(d => {
      const dateStr = (d.last_restock_at || d.first_seen_at || '').slice(0, 10);
      if (!dateStr) return false;
      if (arrivalDateStart && dateStr < arrivalDateStart) return false;
      if (arrivalDateEnd && dateStr > arrivalDateEnd) return false;
      return true;
    });
  }

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>暂无新上架商品数据</p></div>';
    document.getElementById('arrivalPagination').innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(data.length / arrivalPageSize);
  if (arrivalPageNum > totalPages) arrivalPageNum = 1;
  const start = (arrivalPageNum - 1) * arrivalPageSize;
  const pageItems = data.slice(start, start + arrivalPageSize);

  const rows = pageItems.map(d => {
    const imageCell = imgThumb(d.image_url);
    const stockBadge = stockStatusBadge(d.stock, AppState.lowStockThreshold);
    const isRestock = d.last_restock_at && d.first_seen_at && d.last_restock_at !== d.first_seen_at;
    const arrivalTime = d.last_restock_at || d.first_seen_at || '-';
    const arrivalTimeFormatted = arrivalTime !== '-' ? arrivalTime.slice(0, 16) : '-';
    const statusTag = isRestock
      ? '<span class="badge badge-restock">🔄 补货</span>'
      : (d.stock <= 0 ? '<span class="badge badge-danger">🔴 售罄</span>' : '<span class="badge badge-success">🆕 新上架</span>');

    return `<tr>
      <td>${imageCell}</td>
      <td style="font-family:var(--font-mono);">${escapeHtml(d.sku)}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.name)}</td>
      <td style="text-align:center;">${d.stock}</td>
      <td style="text-align:right;">${formatCNY(d.price_cny)}</td>
      <td style="text-align:right;">${formatUSD(d.price_usd)}</td>
      <td style="font-size:0.85rem;white-space:nowrap;">${escapeHtml(arrivalTimeFormatted)}</td>
      <td>${stockBadge} ${statusTag}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead><tr>
        <th style="width:48px;">图片</th><th>SKU</th><th>商品名</th><th style="text-align:center;">库存</th><th style="text-align:right;">采购价¥</th><th style="text-align:right;">采购价$</th><th>上架时间</th><th>状态</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="text-align:center;margin-top:6px;color:var(--text-secondary);font-size:0.8rem;">共 ${data.length} 条</div>
  `;

  renderPagination('arrivalPagination', arrivalPageNum, totalPages, 'goArrivalPage');
}

function goArrivalPage(page) {
  arrivalPageNum = page;
  renderArrivalTable();
}

function debouncedArrivalSearch() {
  clearTimeout(window._arrivalSearchTimer);
  window._arrivalSearchTimer = setTimeout(() => {
    arrivalSearchKeyword = document.getElementById('arrivalSearch').value.trim();
    arrivalPageNum = 1;
    renderArrivalTable();
  }, 300);
}

function onArrivalDateChange() {
  arrivalDateStart = document.getElementById('arrivalDateStart').value;
  arrivalDateEnd = document.getElementById('arrivalDateEnd').value;
}

function filterArrivalByDate() {
  onArrivalDateChange();
  arrivalPageNum = 1;
  renderArrivalTable();
}

function exportArrivalCSV() {
  if (arrivalData.length === 0) {
    showToast('无新上架数据可导出', 'warning');
    return;
  }
  const headers = ['SKU', '商品名', '库存', '采购价¥', '采购价$', '上架时间', '补货', '状态'];
  const rows = arrivalData.map(d => [
    d.sku, d.name, d.stock,
    (d.price_cny / 100).toFixed(2),
    (d.price_usd / 100).toFixed(2),
    (d.last_restock_at || d.first_seen_at || ''),
    (d.last_restock_at && d.first_seen_at && d.last_restock_at !== d.first_seen_at) ? '是' : '否',
    d.stock <= 0 ? '售罄' : (d.stock <= AppState.lowStockThreshold ? '低库存' : '正常')
  ]);
  exportCSV('new_arrivals', headers, rows);
  showToast('CSV 导出成功', 'success');
}
