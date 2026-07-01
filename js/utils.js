/* ===== utils.js — 公共工具函数 ===== */

// ===== Toast 通知 =====
function showToast(message, type = 'success', durationMs = 3000) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, durationMs);
}

// ===== Modal 弹窗 =====
function showModal(title, bodyHtml, footerHtml = '') {
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFooter').innerHTML = footerHtml;
  overlay.classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}

// ===== Confirm 弹窗 =====
function showConfirm(title, message, onConfirm) {
  const body = `<p>${message}</p>`;
  const footer = `
    <button class="btn btn-outline" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" id="confirmBtn">确认</button>
  `;
  showModal(title, body, footer);
  document.getElementById('confirmBtn').onclick = () => { closeModal(); onConfirm(); };
}

// ===== 格式化 =====
function formatCNY(cents) {
  return '¥' + (cents / 100).toFixed(2);
}
function formatUSD(cents) {
  return '$' + (cents / 100).toFixed(2);
}
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function nowISO() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ===== localStorage 封装 =====
const Storage = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem('lv2_' + key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('lv2_' + key, JSON.stringify(value)); } catch (e) {}
  },
  remove(key) {
    try { localStorage.removeItem('lv2_' + key); } catch (e) {}
  },
  clearAll() {
    Object.keys(localStorage).filter(k => k.startsWith('lv2_')).forEach(k => localStorage.removeItem(k));
  }
};

// ===== 导出 CSV =====
function exportCSV(filename, headers, rows) {
  const BOM = '\uFEFF';
  const csv = BOM + headers.join(',') + '\n' + rows.map(row =>
    row.map(cell => {
      const v = String(cell ?? '');
      return /[,"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',')
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename + '.csv';
  a.click(); URL.revokeObjectURL(url);
}

// ===== Debounce =====
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ===== 图片 Lightbox =====
function openLightbox(url) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = url;
  lb.classList.remove('hidden');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
}

// ===== 图片缩略图 HTML =====
function imgThumb(url) {
  if (!url) return '<div class="img-thumb-placeholder">📷</div>';
  return `<img class="img-thumb" src="${escapeHtml(url)}" loading="lazy" onclick="openLightbox('${escapeHtml(url)}')" onerror="this.outerHTML='<div class=img-thumb-placeholder>📷</div>'">`;
}

// ===== XSS 防护 =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== 状态 Badge =====
function stockStatusBadge(stock, threshold = 5) {
  if (stock <= 0) return '<span class="badge badge-danger">🔴 售罄</span>';
  if (stock <= threshold) return '<span class="badge badge-warning">🟡 低库存</span>';
  return '<span class="badge badge-success">🟢 正常</span>';
}

// ===== 分页渲染 =====
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = '<div class="pagination">';
  html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="event.preventDefault();(${onPageChange})(${currentPage - 1})">◀</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="event.preventDefault();(${onPageChange})(${i})">${i}</button>`;
  }
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="event.preventDefault();(${onPageChange})(${currentPage + 1})">▶</button>`;
  html += `<span>第 ${currentPage}/${totalPages} 页</span></div>`;
  container.innerHTML = html;
}
