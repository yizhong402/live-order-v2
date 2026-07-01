/* ===== combo.js — 组合 SKU ===== */

let editingComboId = null;

// ===== 渲染组合 SKU 页 =====
function renderComboPage(container) {
  container.innerHTML = `
    <div class="card">
      <div class="flex justify-between items-center mb-2">
        <span class="card-header" style="margin-bottom:0;">🔗 组合 SKU 列表</span>
        <button class="btn btn-primary btn-sm" onclick="showComboModal()">＋ 创建组合</button>
      </div>
      <div class="table-container" id="comboTableContainer">
        <div class="empty-state"><div class="spinner"></div><p>加载中...</p></div>
      </div>
    </div>
  `;
  loadComboList();
}

// ===== 加载组合列表 =====
async function loadComboList() {
  try {
    const combos = await BaaS.list('combo_skus') || [];
    renderComboTable(combos);
  } catch (e) {
    console.error('加载组合列表失败:', e);
    document.getElementById('comboTableContainer').innerHTML =
      '<div class="empty-state"><div class="empty-icon">❌</div><p>加载失败</p></div>';
  }
}

function renderComboTable(combos) {
  const container = document.getElementById('comboTableContainer');
  if (!combos || combos.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔗</div><p>暂无组合 SKU</p></div>';
    return;
  }

  const rows = combos.map(c => {
    let skuCount = 0;
    try {
      const skus = JSON.parse(c.skus_json || '[]');
      skuCount = skus.length;
    } catch (e) {}
    const time = c.created_at ? c.created_at.slice(0, 10) : '-';
    return `<tr>
      <td style="font-family:var(--font-mono);font-weight:600;">${escapeHtml(c.code)}</td>
      <td style="text-align:center;">${skuCount}</td>
      <td style="font-size:0.85rem;color:var(--text-secondary);">${time}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="toggleComboDetail(${c.id})">▶ 展开</button>
        <button class="btn btn-sm btn-outline" onclick="editComboModal(${c.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCombo(${c.id})">🗑</button>
      </td>
    </tr>
    <tr id="comboDetail${c.id}" style="display:none;">
      <td colspan="4" style="padding:0;">
        <div style="padding:8px 16px;background:rgba(0,0,0,0.2);" id="comboDetailContent${c.id}"></div>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead><tr><th>组合码</th><th style="text-align:center;">包含SKU数</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ===== 展开组合详情 =====
async function toggleComboDetail(id) {
  const detailRow = document.getElementById(`comboDetail${id}`);
  if (detailRow.style.display === 'none' || detailRow.style.display === '') {
    detailRow.style.display = 'table-row';
    try {
      const combos = await BaaS.list('combo_skus', { filter: `id|eq|${id}` });
      if (!combos || combos.length === 0) return;
      const combo = combos[0];
      const skus = JSON.parse(combo.skus_json || '[]');
      const products = AppState.products || [];
      const rows = skus.map(s => {
        const product = products.find(p => p.sku === s.sku);
        const name = product ? product.name : s.sku;
        const stock = product ? product.stock : '?';
        const priceCNY = product ? formatCNY(product.price_cny) : '?';
        return `<tr>
          <td style="font-family:var(--font-mono);">${escapeHtml(s.sku)}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}</td>
          <td style="text-align:center;">${s.qty || 1}</td>
          <td style="text-align:center;">${stock}</td>
          <td style="text-align:right;">${priceCNY}</td>
        </tr>`;
      }).join('');
      document.getElementById(`comboDetailContent${id}`).innerHTML = `
        <table>
          <thead><tr><th>SKU</th><th>名称</th><th style="text-align:center;">数量</th><th style="text-align:center;">库存</th><th style="text-align:right;">采购价¥</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } catch (e) {
      console.error('加载组合详情失败:', e);
    }
  } else {
    detailRow.style.display = 'none';
  }
}

// ===== 创建/编辑组合弹窗 =====
function showComboModal(id) {
  editingComboId = id || null;
  const isEdit = !!id;
  const title = isEdit ? '编辑组合' : '创建组合';

  let codeInput = '';
  let preSelectedSkus = [];
  if (isEdit) {
    BaaS.list('combo_skus', { filter: `id|eq|${id}` }).then(result => {
      if (result && result.length > 0) {
        const combo = result[0];
        document.getElementById('comboCodeInput').value = combo.code || '';
        try {
          const skus = JSON.parse(combo.skus_json || '[]');
          preSelectedSkus = skus;
          renderComboSKUSelector(skus);
        } catch (e) {}
      }
    }).then(null, () => {});
  }

  const body = `
    <div class="form-group">
      <label class="form-label">组合码</label>
      <input class="input" id="comboCodeInput" placeholder="例如: TEST-COMBO-A" value="${escapeHtml(codeInput)}">
    </div>
    <div class="form-group">
      <label class="form-label">添加 SKU</label>
      <input class="input mb-1" id="comboSkuSearch" placeholder="🔍 搜索 SKU..." oninput="renderComboSKUSelector()">
      <div id="comboSkuSelector" style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:var(--radius-sm);padding:8px;">
        <p style="color:var(--text-secondary);font-size:0.85rem;">输入搜索 SKU...</p>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">已选 SKU</label>
      <div id="comboSelectedSkus" style="max-height:200px;overflow-y:auto;"></div>
    </div>
  `;

  showModal(title, body,
    `<button class="btn btn-outline" onclick="closeModal()">取消</button>
     <button class="btn btn-primary" onclick="saveCombo()">💾 保存</button>`);

  if (!isEdit) {
    renderComboSKUSelector();
  }
}

let comboSelectedSkus = {}; // { sku: qty }
let allProductsForCombo = [];

async function renderComboSKUSelector(preSelected) {
  const keyword = document.getElementById('comboSkuSearch')?.value?.toLowerCase() || '';

  if (allProductsForCombo.length === 0) {
    allProductsForCombo = AppState.products || [];
    try {
      if (allProductsForCombo.length === 0) {
        allProductsForCombo = await BaaS.list('products') || [];
      }
    } catch (e) {}
  }

  let filtered = allProductsForCombo;
  if (keyword) {
    filtered = filtered.filter(p =>
      (p.sku || '').toLowerCase().includes(keyword) ||
      (p.name || '').toLowerCase().includes(keyword)
    );
  }
  filtered = filtered.slice(0, 50);

  // 初始化预选
  if (preSelected && Object.keys(comboSelectedSkus).length === 0) {
    preSelected.forEach(s => {
      comboSelectedSkus[s.sku] = (s.qty || 1);
    });
    renderComboSelectedList();
  }

  const rows = filtered.map(p => {
    const checked = comboSelectedSkus[p.sku] ? 'checked' : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-color);">
      <input type="checkbox" ${checked} onchange="toggleComboSku('${escapeHtml(p.sku)}', this.checked)">
      <span style="font-family:var(--font-mono);font-size:0.85rem;">${escapeHtml(p.sku)}</span>
      <span style="font-size:0.8rem;color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</span>
      <span style="font-size:0.8rem;">库存: ${p.stock}</span>
    </div>`;
  }).join('');

  document.getElementById('comboSkuSelector').innerHTML =
    rows || '<p style="color:var(--text-secondary);font-size:0.85rem;">无匹配商品</p>';
}

function toggleComboSku(sku, checked) {
  if (checked) {
    comboSelectedSkus[sku] = 1;
  } else {
    delete comboSelectedSkus[sku];
  }
  renderComboSelectedList();
}

function renderComboSelectedList() {
  const container = document.getElementById('comboSelectedSkus');
  const entries = Object.entries(comboSelectedSkus);
  if (entries.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;">暂未选择 SKU</p>';
    return;
  }
container.innerHTML = entries.map(([sku, qty]) => {
    const product = allProductsForCombo.find(p => p.sku === sku);
    const name = product ? product.name : sku;
    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-color);">
      <span style="font-family:var(--font-mono);">${escapeHtml(sku)}</span>
      <span style="flex:1;font-size:0.85rem;">${escapeHtml(name)}</span>
      <button class="btn btn-sm btn-outline" onclick="changeComboSkuQty('${escapeHtml(sku)}', -1)">-</button>
      <span style="min-width:20px;text-align:center;">${qty}</span>
      <button class="btn btn-sm btn-outline" onclick="changeComboSkuQty('${escapeHtml(sku)}', 1)">+</button>
      <button class="btn btn-sm btn-danger" onclick="delete comboSelectedSkus['${escapeHtml(sku)}'];renderComboSelectedList();">✕</button>
    </div>`;
  }).join('');
}

function changeComboSkuQty(sku, delta) {
  comboSelectedSkus[sku] = Math.max(1, (comboSelectedSkus[sku] || 1) + delta);
  renderComboSelectedList();
}

// ===== 保存组合 =====
async function saveCombo() {
  const code = document.getElementById('comboCodeInput')?.value.trim();
  if (!code) {
    showToast('请输入组合码', 'warning');
    return;
  }
  const entries = Object.entries(comboSelectedSkus);
  if (entries.length === 0) {
    showToast('请至少添加一个 SKU', 'warning');
    return;
  }

  const skusJson = JSON.stringify(entries.map(([sku, qty]) => ({ sku, qty })));

  try {
    if (editingComboId) {
      await BaaS.update('combo_skus', editingComboId, {
        code, skus_json: skusJson
      });
      showToast('组合已更新', 'success');
    } else {
      await BaaS.insert('combo_skus', {
        code,
        skus_json: skusJson,
        created_at: nowISO()
      });
      showToast('组合创建成功', 'success');
    }
    closeModal();
    comboSelectedSkus = {};
    editingComboId = null;
    loadComboList();
  } catch (e) {
    showToast('保存组合失败: ' + e.message, 'error');
  }
}

// ===== 编辑组合 =====
async function editComboModal(id) {
  try {
    const combos = await BaaS.list('combo_skus', { filter: `id|eq|${id}` });
    if (!combos || combos.length === 0) return;
    const combo = combos[0];
    comboSelectedSkus = {};
    try {
      const skus = JSON.parse(combo.skus_json || '[]');
      skus.forEach(s => { comboSelectedSkus[s.sku] = s.qty || 1; });
    } catch (e) {}
    showComboModal(id);
  } catch (e) {
    showToast('加载组合失败', 'error');
  }
}

// ===== 删除组合 =====
function deleteCombo(id) {
  showConfirm('删除组合', '确认删除该组合 SKU？', async () => {
    try {
      await BaaS.delete('combo_skus', id);
      showToast('组合已删除', 'success');
      loadComboList();
    } catch (e) {
      showToast('删除组合失败', 'error');
    }
  });
}
