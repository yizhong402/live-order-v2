/* ===== hot.js — 热卖排行 ===== */

let hotSearchKeyword = '';
let hotPageNum = 1;
const hotPageSize = 序0;
var hotSalesData = []; // [{ sku, name, image_url, stock, price_cny, price_usd, total_qty }]

// ===== 渲染热卖页 =====
function renderHotPage(container) {
  container.innerHTML = `
    <div class="card">
      <div class="flex justify-between items-center mb-2">
        <div class="card-header" style="margin-bottom:0;">🔥 热卖排行 Top 100</div>
        <div class="flex gap-1">
          <input class="input" id="hotSearch" placeholder="🔍 搜索 SKU/名称..." oninput="debouncedHotSearch()" style="width:200px;">
          <button class="btn btn-outline btn-sm" onclick="exportHotCSV()">导出CSV</button>
        </div>
      </div>
      <div class="table-container" id="hotTableContainer">
        <div class="empty-state"><div class="spinner"></div><p>正在计算热卖数据...</p></div>
      </div>
      <div id="hotPagination"></div>
    </div>
  `;
  loadHotSales();
}

// ===== 加载热卖数据 =====
async function loadHotSales() {
  try {
    // 尝试从缓存加载
    const cache = Storage.get('hot_sales_cache');
    let lastOrderId = 0;

    if (cache && Array.isArray(cache.data)) {
      hotSalesData = cache.data;
      lastOrderId = cache.last_max_order_id || 0;
    }

    // 增量更新：查询新增订单
    let newOrders = [];
    try {
      const allOrders = await BaaS.list('orders', { orderBy: 'id', orderDir: 'desc', limit: 5000 });
      if (allOrders && allOrders.length > 0) {
        newOrders = lastOrderId > 0
          ? allOrders.filter(o => o.id > lastOrderId)
          : allOrders;
      }
    } catch (e) {
      console.error('拉取订单失败:', e);
    }

    if (newOrders.length > 0) {
      // 聚合销量
      const salesMap = {};
      // 先加载已有数据
      if (hotSalesData.length > 0) {
        hotSalesData.forEach(item => {
          salesMap[item.sku] = item.total_qty || 0;
        });
      }

      newOrders.forEach(o => {
        try {
          const skus = JSON.parse(o.skus_json || '[]');
          skus.forEach(s => {
            salesMap[s.sku] = (salesMap[s.sku] || 0) + (s.qty || 1);
          });
        } catch (e) {}
      });

      // 获取最新订单 ID
      const newLastOrderId = Math.max(...newOrders.map(o => o.id), lastOrderId);

      // 转换为数组并排序
      const products = AppState.products || [];
      hotSalesData = Object.entries(salesMap)
        .map(([sku, total_qty]) => {
          const product = products.find(p => p.sku === sku);
          return {
            sku,
            name: product?.name || sku,
            image_url: product?.image_url || '',
            stock: product?.stock || 0,
            price_cny: product?.price_cny || 0,
            price_usd: product?.price_usd || 0,
            total_qty
          };
        })
        .sort((a, b) => b.total_qty - a.total_qty);

      // 更新缓存
      Storage.set('hot_sales_cache', {
        data: hotSalesData,
        last_max_order_id: newLastOrderId,
        updated_at: nowISO()
      });
    } else if (hotSalesData.length === 0) {
      // 无缓存也无新订单：实时聚合
      await regenerateHotSales();
    }

    renderHotTable();
  } catch (e) {
    console.error('加载热卖数据失败:', e);
    document.getElementById('hotTableContainer').innerHTML =
      '<div class="empty-state"><div class="empty-icon">❌</div><p>加载失败</p></div>';
  }
}

async function regenerateHotSales() {
  try {
    const allOrders = await BaaS.list('orders', { limit: 10000 }) || [];
    const salesMap = {};
    allOrders.forEach(o => {
      try {
        const skus = JSON.parse(o.skus_json || '[]');
        skus.forEach(s => {
          salesMap[s.sku] = (salesMap[s.sku] || 0) + (s.qty || 1);
        });
      } catch (e) {}
    });

    const products = AppState.products || [];
    hotSalesData = Object.entries(salesMap)
      .map(([sku, total_qty]) => {
        const product = products.find(p => p.sku === sku);
        return {
          sku,
          name: product?.name || sku,
          image_url: product?.image_url || '',
          stock: product?.stock || 0,
          price_cny: product?.price_cny || 0,
          price_usd: product?.price_usd || 0,
          total_qty
        };
      })
      .sort((a, b) => b.total_qty - a.total_qty);

    const maxId = allOrders.length > 0 ? Math.max(...allOrders.map(o => o.id)) : 0;
    Storage.set('hot_sales_cache', {
      data: hotSalesData,
      last_max_order_id: maxId,
      updated_at: nowISO()
    });
  } catch (e) {
    console.error('全量聚合失败:', e);
  }
}

function renderHotTable() {
  const container = document.getElementById('hotTableContainer');
  let data = hotSalesData;

  // 搜索筛选
  if (hotSearchKeyword) {
    const kw = hotSearchKeyword.toLowerCase();
    data = data.filter(d =>
      d.sku.toLowerCase().includes(kw) ||
      d.name.toLowerCase().includes(kw)
    );
  }

  // Top 100
  data = data.slice(0, 100);

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>暂无销售数据</p></div>';
    document.getElementById('hotPagination').innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(data.length / hotPageSize);
  if (hotPageNum > totalPages) hotPageNum = 1;
  const start = (hotPageNum - 1) * hotPageSize;
  const pageItems = data.slice(start, start + hotPageSize);

  const rows = pageItems.map((d, i) => {
    const rank = start + i + 1;
    const imageCell = imgThumb(d.image_url);
    const stockBadge = stockStatusBadge(d.stock, AppState.lowStockThreshold);
    return `<tr>
      <td style="text-align:center;font-weight:700;">${rank}</td>
      <td>${imageCell}</td>
      <td style="font-family:var(--font-mono);">${escapeHtml(d.sku)}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.name)}</td>
      <td style="text-align:center;">${d.stock}</td>
      <td style="text-align:right;">${formatCNY(d.price_cny)}</td>
      <td style="text-align:right;">${formatUSD(d.price_usd)}</td>
      <td style="text-align:center;font-weight:700;">${d.total_qty.toLocaleString()}</td>
      <td>${stockBadge}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead><tr>
        <th style="width:40px;">#</th><th style="width:48px;">图片</th><th>SKU</th><th>商品名</th><th style="text-align:center;">库存</th><th style="text-align:right;">采购价¥</th><th style="text-align:right;">采购价$</th><th style="text-align:center;">销量</th><th>状态</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="text-align:center;margin-top:6px;color:var(--text-secondary);font-size:0.8rem;">共 ${data.length} 条（Top 100）</div>
  `;

  renderPagination('hotPagination', hotPageNum, totalPages, 'goHotPage');
}

function goHotPage(page) {
  hotPageNum = page;
  renderHotTable();
}

function debouncedHotSearch() {
  clearTimeout(window._hotSearchTimer);
  window._hotSearchTimer = setTimeout(() => {
    hotSearchKeyword = document.getElementById('hotSearch').value.trim();
    hotPageNum = 1;
    renderHotTable();
  }, 300);
}

function exportHotCSV() {
  if (hotSalesData.length === 0) {
    showToast('无热卖数据可导出', 'warning');
    return;
  }
  const headers = ['排名', 'SKU', '商品名', '库存', '采购价¥', '采购价$', '累计销量', '状态'];
  const rows = hotSalesData.slice(0, 100).map((d, i) => [
    i + 1, d.sku, d.name, d.stock,
    (d.price_cny / 100).toFixed(2),
    (d.price_usd / 100).toFixed(2),
    d.total_qty,
    d.stock <= 0 ? '售罄' : (d.stock <= AppState.lowStockThreshold ? '低库存' : '正常')
  ]);
  exportCSV('hot_sales_top100', headers, rows);
  showToast('CSV 导出成功', 'success');
}
