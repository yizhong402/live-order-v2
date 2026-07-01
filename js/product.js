/* ===== product.js — 商品管理 + 手动同步 + V1迁移 ===== */

let productPage = 1;
let productPageSize = 50;
let productSearchKeyword = '';
let productStatusFilter = '';
let syncingInProgress = false;

// ===== 渲染商品管理页 =====
function renderProductPage(container) {
  container.innerHTML = `
    <div class="card">
      <div class="flex justify-between items-center mb-2">
        <div class="search-bar flex-1">
          <input class="input" id="productSearch" placeholder="🔍 搜索 SKU/名称..." oninput="debouncedProductSearch()">
          <select class="input select" id="productStatusFilter" onchange="onProductStatusFilter()" style="width:140px;">
            <option value="">全部状态</option>
            <option value="normal">🟢 正常</option>
            <option value="low">🟡 低库存</option>
            <option value="zero">🔴 零库存</option>
          </select>
        </div>
        <div class="flex gap-1">
          <button class="btn btn-primary" onclick="triggerManualSync()" id="manualSyncBtn">🔄 手动同步 OMS</button>
          <button class="btn btn-outline" onclick="exportProductsCSV()">导出CSV</button>
        </div>
      </div>

      <!-- 同步进度条 -->
      <div id="syncProgress" style="display:none;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span id="syncStatusText" style="font-size:0.85rem;">准备同步...</span>
          <span id="syncPercent" style="font-size:0.85rem;">0%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" id="syncProgressFill" style="width:0%"></div></div>
        <div id="syncLog" style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;max-height:80px;overflow-y:auto;"></div>
      </div>

      <!-- 商品表格 -->
      <div class="table-container" id="productTableContainer">
        <div class="empty-state"><div class="spinner"></div><p>加载中...</p></div>
      </div>

      <!-- 分页 -->
      <div id="productPagination"></div>
    </div>

    <!-- V1 迁移区域 -->
    <div class="card mt-2">
      <div class="card-header">📦 数据迁移</div>
      <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">
        从 V1 直接迁移现有商品数据到 V2，跳过首次 OMS 全量同步。已存在的商品不会重复导入。
      </p>
      <button class="btn btn-warning" id="migrateBtn" onclick="migrateFromV1()">📦 从 V1 迁移商品数据</button>
      <div id="migrateProgress" style="display:none;margin-top:8px;">
        <div class="progress-bar"><div class="progress-fill" id="migrateProgressFill" style="width:0%"></div></div>
        <span id="migrateStatus" style="font-size:0.8rem;color:var(--text-secondary);"></span>
      </div>
    </div>
  `;

  loadProductPage();
}

// ===== 加载商品列表 =====
async function loadProductPage() {
  try {
    const allProducts = await BaaS.list('products');
    AppState.products = allProducts || [];
    renderProductTable(AppState.products);
  } catch (e) {
    console.error('加载商品列表失败:', e);
    document.getElementById('productTableContainer').innerHTML =
      '<div class="empty-state"><div class="empty-icon">❌</div><p>加载失败，请检查 BaaS 连接</p></div>';
  }
}

function renderProductTable(products) {
  const container = document.getElementById('productTableContainer');
  if (!products || products.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>暂无商品数据，请先同步 OMS 或从 V1 迁移</p></div>';
    document.getElementById('productPagination').innerHTML = '';
    return;
  }

  // 筛选
  let filtered = products;
  if (productSearchKeyword) {
    const kw = productSearchKeyword.toLowerCase();
    filtered = filtered.filter(p =>
      (p.sku || '').toLowerCase().includes(kw) ||
      (p.name || '').toLowerCase().includes(kw)
    );
  }
  if (productStatusFilter === 'normal') {
    filtered = filtered.filter(p => p.stock > AppState.lowStockThreshold);
  } else if (productStatusFilter === 'low') {
    filtered = filtered.filter(p => p.stock > 0 && p.stock <= AppState.lowStockThreshold);
  } else if (productStatusFilter === 'zero') {
    filtered = filtered.filter(p => p.stock <= 0);
  }

  const totalPages = Math.ceil(filtered.length / productPageSize);
  if (productPage > totalPages) productPage = 1;
  const start = (productPage - 1) * productPageSize;
  const pageItems = filtered.slice(start, start + productPageSize);

  const rows = pageItems.map((p, i) => {
    const stockBadge = stockStatusBadge(p.stock, AppState.lowStockThreshold);
    const imageCell = imgThumb(p.image_url);
    return `<tr>
      <td style="text-align:center;">${start + i + 1}</td>
      <td style="font-family:var(--font-mono);">${escapeHtml(p.sku)}</td>
      <td>${imageCell}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</td>
      <td style="text-align:center;cursor:pointer;" ondblclick="editProductStock(${p.id}, ${p.stock})" title="双击编辑库存">${p.stock}</td>
      <td style="text-align:right;">${formatCNY(p.price_cny)}</td>
      <td style="text-align:right;">${formatUSD(p.price_usd)}</td>
      <td>${stockBadge}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead><tr>
        <th style="width:40px;">#</th><th>SKU</th><th style="width:48px;">图片</th><th>商品名</th><th style="text-align:center;">库存</th><th style="text-align:right;">采购价¥</th><th style="text-align:right;">采购价$</th><th>状态</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
 fam<div style="text-align:center;margin-top:6px;color:var(--text-secondary);font-size:0.8rem;">共 ${filtered.length} 条</div>
  `;

  renderPagination('productPagination', productPage, totalPages, 'goProductPage');
}

function goProductPage(page) {
  productPage = page;
  renderProductTable(AppState.products);
}

// ===== 搜索 =====
function debouncedProductSearch() {
  clearTimeout(window._productSearchTimer);
  window._productSearchTimer = setTimeout(() => {
    productSearchKeyword = document.getElementById('productSearch').value.trim();
    productPage = 1;
    renderProductTable(AppState.products);
  }, 300);
}

function onProductStatusFilter() {
  productStatusFilter = document.getElementById('productStatusFilter').value;
  productPage = 1;
  renderProductTable(AppState.products);
}

// ===== 编辑库存 =====
async function editProductStock(id, currentStock) {
  const newStock = prompt('请输入新库存数量:', currentStock);
  if (newStock === null || newStock === '') return;
  const stockNum = parseInt(newStock);
  if (isNaN(stockNum) || stockNum < 0) {
    showToast('请输入有效的库存数量', 'warning');
    return;
  }

  try {
    const product = AppState.products.find(p => p.id === id);
    if (!product) return;

    const wasZero = product.stock <= 0;
    product.stock = stockNum;

    await BaaS.update('products', id, { stock: stockNum });

    // 补货逻辑：库存从 0 -> >0
    if (wasZero && stockNum > 0) {
      const now = nowISO();
      product.last_restock_at = now;
      await BaaS.update('products', id, { last_restock_at: now });
    }

    product.updated_at = nowISO();
    showToast('库存已更新', 'success');
    renderProductTable(AppState.products);
  } catch (e) {
    showToast('更新库存失败', 'error');
  }
}

// ===== 导出 CSV =====
function exportProductsCSV() {
  if (!AppState.products || AppState.products.length === 0) {
    showToast('无商品数据可导出', 'warning');
    return;
  }
  const headers = ['SKU', '商品名', '库存', '采购价¥', '采购价$', '图片URL', '状态'];
  const rows = AppState.products.map(p => [
    p.sku, p.name, p.stock,
    (p.price_cny / 100).toFixed(2),
    (p.price_usd / 100).toFixed(2),
    p.image_url || '',
    p.stock <= 0 ? '售罄' : (p.stock <= AppState.lowStockThreshold ? '低库存' : '正常')
  ]);
  exportCSV('products', headers, rows);
  showToast('CSV 导出成功', 'success');
}

// ===== 手动同步 OMS =====
async function triggerManualSync() {
  if (syncingInProgress) {
    showToast('同步已在进行中', 'warning');
    return;
  }

  if (!OMS.isAuthorized()) {
    showToast('请先在系统设置中完成 OMS OAuth 授权', 'warning');
    return;
  }

  syncingInProgress = true;
  const syncDiv = document.getElementById('syncProgress');
  const statusText = document.getElementById('syncStatusText');
  const percentText = document.getElementById('syncPercent');
  const progressFill = document.getElementById('syncProgressFill');
  const syncLog = document.getElementById('syncLog');
  const syncBtn = document.getElementById('manualSyncBtn');

  syncDiv.style.display = 'block';
  syncBtn.disabled = true;
  syncLog.innerHTML = '';

  function addLog(msg) {
    syncLog.innerHTML += `<div>${escapeHtml(msg)}</div>`;
    syncLog.scrollTop = syncLog.scrollHeight;
  }

  try {
    addLog('🔄 开始手动同步 OMS → BaaS...');
    statusText.textContent = '获取仓库信息...';
    percentText.textContent = '0%';
    progressFill.style.width = '0%';

    // 1. 获取 PA 仓库
    const warehouses = await OMS.getWarehouseList();
    const paWarehouse = warehouses?.find(w => w.code === 'PA' || w.name?.includes('PA'));
    if (!paWarehouse) throw new Error('未找到 PA 仓库');
    AppState.warehouseCode = paWarehouse.code;
    addLog(`✅ 找到仓库: ${paWarehouse.name} (${paWarehouse.code})`);

    // 2. 分页拉取 SKU 详情 + 库存
    let pageNo = 1;
    const pageSize = 300;
    let totalProcessed = 0;
    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    // 第一页先获取总数
    statusText.textContent = '拉取商品详情...';
    const firstPage = await OMS.getSkuDetail(pageNo, pageSize);
    const totalSize = firstPage?.totalSize || 0;
    const totalPages = firstPage?.totalPage || 1;
    const firstRows = firstPage?.rows || [];

    addLog(`📊 OMS 共 ${totalSize} 个 SKU，分 ${totalPages} 页`);

    // 获取第一页库存
    const firstSkus = firstRows.map(r => r.sku).filter(Boolean);
    let inventoryMap = {};
    if (firstSkus.length > 0) {
      try {
        const invData = await OMS.queryInventory(paWarehouse.code, firstSkus);
        if (invData?.rows) {
          invData.rows.forEach(r => { inventoryMap[r.sku] = r; });
        }
      } catch (e) { addLog(`⚠️ 库存查询失败: ${e.message}`); }
    }

    await processPageRows(firstRows, inventoryMap);
    totalProcessed += firstRows.length;

    // 循环剩余页
    for (pageNo = 2; pageNo <= totalPages; pageNo++) {
      const percent = Math.round((pageNo / totalPages) * 100);
      statusText.textContent = `同步中...`;
      percentText.textContent = `${percent}%`;
      progressFill.style.width = `${percent}%`;

      const page = await OMS.getSkuDetail(pageNo, pageSize);
      const rows = page?.rows || [];

      // 获取本页库存
      const skuList = rows.map(r => r.sku).filter(Boolean);
      inventoryMap = {};
      if (skuList.length > 0) {
        try {
          const invData = await OMS.queryInventory(paWarehouse.code, skuList);
          if (invData?.rows) {
            invData.rows.forEach(r => { inventoryMap[r.sku] = r; });
          }
        } catch (e) {}
      }

      await processPageRows(rows, inventoryMap);
      totalProcessed += rows.length;
    }

    addLog(`✅ 同步完成: 新增 ${newCount} / 更新 ${updatedCount} / 跳过 ${skippedCount}`);
    statusText.textContent = '同步完成';
    percentText.textContent = '100%';
    progressFill.style.width = '100%';

    // 刷新列表
    await loadProductPage();
    showToast(`同步完成: 新增 ${newCount}, 更新 ${updatedCount}`, 'success');
  } catch (e) {
    addLog(`❌ 同步失败: ${escapeHtml(e.message)}`);
    statusText.textContent = '同步失败';
    showToast('同步失败: ' + e.message, 'error');
  } finally {
    syncingInProgress = false;
    syncBtn.disabled = false;
  }

  // 处理每页数据
  async function processPageRows(rows, inventoryMap) {
    for (const row of rows) {
      const sku = row.sku;
      if (!sku) continue;

      const inventory = inventoryMap[sku];
      const availableStock = inventory?.availableStock ?? 0;
      const existingProduct = AppState.products?.find(p => p.sku === sku);

      if (existingProduct) {
        // 已有商品：检查是否需要更新
        let needUpdate = false;
        const updates = {};

        if (existingProduct.stock !== availableStock) {
          // 补货检测：库存从 0 -> >0
          if (existingProduct.stock <= 0 && availableStock > 0) {
            updates.last_restock_at = nowISO();
          }
          updates.stock = availableStock;
          needUpdate = true;
        }
        if (row.name && existingProduct.name !== row.name) {
          updates.name = row.name;
          needUpdate = true;
        }
        if (row.imgUrl && existingProduct.image_url !== row.imgUrl) {
          updates.image_url = row.imgUrl;
          needUpdate = true;
        }
        if (row.updateTime) {
          updates.updated_at = row.updateTime;
          needUpdate = true;
        }

        if (needUpdate) {
          try {
            await BaaS.update('products', existingProduct.id, updates);
            Object.assign(existingProduct, updates);
            updatedCount++;
          } catch (e) {
            addLog(`⚠️ 更新失败: ${sku} - ${e.message}`);
          }
        } else {
          skippedCount++;
        }
      } else {
        // 新商品
        try {
          const newProduct = {
            sku,
            name: row.name || sku,
            stock: availableStock,
            price_cny: 0,
            price_usd: 0,
            image_url: row.imgUrl || '',
            first_seen_at: row.createTime || nowISO(),
            last_restock_at: availableStock > 0 ? (row.createTime || nowISO()) : null,
            updated_at: row.updateTime || nowISO()
          };
          const result = await BaaS.insert('products', newProduct);
          newProduct.id = typeof result === 'number' ? result : (result?.id || result);
          AppState.products.push(newProduct);
          newCount++;
        } catch (e) {
          addLog(`⚠️ 新增失败: ${sku} - ${e.message}`);
        }
      }
    }
  }
}

// ===== V1 迁移 =====
async function migrateFromV1() {
  const migrateDiv = document.getElementById('migrateProgress');
  const progressFill = document.getElementById('migrateProgressFill');
  const statusText = document.getElementById('migrateStatus');
  const migrateBtn = document.getElementById('migrateBtn');

  migrateDiv.style.display = 'block';
  migrateBtn.disabled = true;

  try {
    statusText.textContent = '正在从 V1 拉取商品数据...';
    progressFill.style.width = '10%';

    // 从 V1 products 表拉取
    const response = await fetch(BaaS.baseURL, {
      method: 'POST',
      headers: BaaS.headers,
      body: JSON.stringify({ table: 'products', method: 'list', pageSize: 10000 })
    });
    const json = await response.json();
    if (json.code !== 0) throw new Error(json.message);
    const v1Products = json.data || [];

    statusText.textContent = `从 V1 拉取到 ${v1Products.length} 条商品数据，正在写入 V2...`;
    progressFill.style.width = '30%';

    // 检查 V2 已存在的 SKU
    const existingProducts = AppState.products || [];
    const existingSkus = new Set(existingProducts.map(p => p.sku));
    const toImport = v1Products.filter(p => !existingSkus.has(p.sku));

    if (toImport.length === 0) {
      statusText.textContent = '所有 V1 商品已存在于 V2，无需迁移';
      progressFill.style.width = '100%';
      showToast('迁移完成：所有数据已存在', 'success');
      return;
    }

    // 批量写入
    const batchSize = 50;
    let imported = 0;
    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize).map(p => ({
        sku: p.sku,
        name: p.name || '',
        stock: p.stock || 0,
        price_cny: p.price_cny || 0,
        price_usd: p.price_usd || 0,
        image_url: p.image_url || '',
        first_seen_at: p.updated_at || nowISO(),
        last_restock_at: null,
        updated_at: p.updated_at || nowISO()
      }));

      try {
        await BaaS.insertBatch('products', batch);
        AppState.products.push(...batch);
        imported += batch.length;
        const percent = 30 + Math.round((imported / toImport.length) * 70);
        progressFill.style.width = `${percent}%`;
        statusText.textContent = `正在迁移: ${imported}/${toImport.length}`;
      } catch (e) {
        statusText.textContent += `\n批次写入失败: ${e.message}`;
      }
    }

    progressFill.style.width = '100%';
    statusText.textContent = `✅ 迁移完成: 成功导入 ${imported} 条商品数据`;
    showToast(`迁移完成: ${imported} 条`, 'success');
    await loadProductPage();
  } catch (e) {
    statusText.textContent = `❌ 迁移失败: ${e.message}`;
    showToast('迁移失败: ' + e.message, 'error');
  } finally {
    migrateBtn.disabled = false;
  }
}
