/* ===== baas.js — BaaS 客户端统一封装 ===== */
const BaaS = {
  baseURL: 'https://baas.kuafuai.net/baas-api/api/data/invoke',
  headers: { 'Content-Type': 'application/json', 'CODE_FLYING': 'baas_CJbcgwuf' },

  // 初始化：从设置加载 CODE_FLYING
  async init() {
    try {
      const settings = await this.list('settings');
      if (settings && settings.length) {
        settings.forEach(s => {
          if (s.key === 'baas_code_flying' && s.value) {
            this.headers['CODE_FLYING'] = s.value;
          }
        });
      }
    } catch (e) {
      console.warn('BaaS init: 未能从设置加载 CODE_FLYING（使用默认）');
    }
  },

  async _request(body) {
    try {
      const res = await fetch(this.baseURL, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('BaaS request failed:', body, e);
      throw e;
    }
  },

  // ===== 查询 =====
  async list(table, { filter = null, orderBy = null, orderDir = null, limit = null, pageNo = 1, pageSize = 10000 } = {}) {
    const body = { table, method: 'list' };
    if (filter) body.filter = filter;
    if (orderBy) body.orderBy = orderBy;
    if (orderDir) body.orderDir = orderDir;
    if (limit) body.limit = limit;
    body.pageNo = pageNo;
    body.pageSize = pageSize;
    const result = await this._request(body);
    if (result.code !== 0) throw new Error(`BaaS list failed: ${result.message}`);
    return result.data || [];
  },

  getById(table, id) {
    return this._request({ table, method: 'get', id });
  },

  // ===== 插入 =====
  async insert(table, values) {
    const result = await this._request({ table, method: 'insert', values });
    if (result.code !== 0) throw new Error(`BaaS insert failed: ${result.message}`);
    return result.data;
  },

  async insertBatch(table, rows) {
    const results = [];
    for (const values of rows) {
      const r = await this.insert(table, values);
      results.push(r);
    }
    return results;
  },

  // ===== 更新 =====
  async update(table, id, values) {
    const result = await this._request({ table, method: 'update', id, values });
    if (result.code !== 0) throw new Error(`BaaS update failed: ${result.message}`);
    return result.data;
  },

  // ===== 删除 =====
  async delete(table, id) {
    const result = await this._request({ table, method: 'delete', id });
    if (result.code !== 0) throw new Error(`BaaS delete failed: ${result.message}`);
    return result.data;
  },

  // ===== 表名映射 =====
  table(name) {
    const map = {
      sessions: 'live_sessions_v2',
      orders: 'orders_v2',
      products: 'products_v2',
      combos: 'combo_skus_v2',
      settings: 'settings_v2'
    };
    return map[name] || name;
  }
};
