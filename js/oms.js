/* ===== oms.js — OMS OAuth + API 客户端 ===== */
const OMS = {
  _baseURL: '',
  _accessToken: null,
  _refreshToken: null,
  _expireAt: null,
  _userId: null,
  _clientId: '',
  _clientSecret: '',
  _warehouseCode: 'PA',

  // ===== OAuth 第一步：获取授权码 =====
  async authorize(domain, clientId, email, token) {
    const baseURL = domain.replace(/\/+$/, '');
    const url = `${baseURL}/api/oauth/authorize?clientId=${encodeURIComponent(clientId)}&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OAuth authorize failed: HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(`OAuth authorize error: ${json.message}`);
    this._baseURL = baseURL;
    this._clientId = clientId;
    return json.data; // 授权码
  },

  // ===== OAuth 第二步：换取 AccessToken =====
  async getAccessToken(clientId, clientSecret, authCode) {
    const url = `${this._baseURL}/api/oauth/accessToken?clientId=${encodeURIComponent(clientId)}&clientSecret=${encodeURIComponent(clientSecret)}&key=${encodeURIComponent(authCode)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OAuth accessToken failed: HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(`OAuth accessToken error: ${json.message}`);
    const data = json.data;
    this._accessToken = data.accessToken;
    this._refreshToken = data.refreshToken;
    this._expireAt = Date.now() + (data.expireIn || 7200) * 1000;
    this._userId = data.userId;
    this._clientSecret = clientSecret;
    this._saveTokens();
    return data;
  },

  // ===== OAuth 第三步：刷新 AccessToken =====
  async refreshAccessToken() {
    if (!this._refreshToken || !this._userId) throw new Error('No refresh token available');
    const url = `${this._baseURL}/api/oauth/refreshToken?clientId=${encodeURIComponent(this._clientId)}&refreshToken=${encodeURIComponent(this._refreshToken)}&userId=${encodeURIComponent(this._userId)}`;
    if (this._clientSecret) url += `&clientSecret=${encodeURIComponent(this._clientSecret)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OAuth refreshToken failed: HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(`OAuth refreshToken error: ${json.message}`);
    const data = json.data;
    this._accessToken = data.accessToken;
    this._refreshToken = data.refreshToken;
    this._expireAt = Date.now() + (data.expireIn || 7200) * 1000;
    this._saveTokens();
    return data;
  },

  // ===== 确保 Token 有效 =====
  async ensureToken() {
    if (!this._accessToken) throw new Error('未授权，请先完成 OAuth 授权流程');
    // 提前 5 分钟刷新
    if (this._expireAt && Date.now() > this._expireAt - 300000) {
      await this.refreshAccessToken();
    }
  },

  // ===== 持久化 Token =====
  _saveTokens() {
    Storage.set('oms_tokens', {
      baseURL: this._baseURL,
      accessToken: this._accessToken,
      refreshToken: this._refreshToken,
      expireAt: this._expireAt,
      userId: this._userId,
      clientId: this._clientId,
      clientSecret: this._clientSecret
    });
  },
  loadTokens() {
    const saved = Storage.get('oms_tokens');
    if (saved) {
      this._baseURL = saved.baseURL || '';
      this._accessToken = saved.accessToken;
      this._refreshToken = saved.refreshToken;
      this._expireAt = saved.expireAt;
      this._userId = saved.userId;
      this._clientId = saved.clientId || '';
      this._clientSecret = saved.clientSecret || '';
    }
  },
  clearTokens() {
    this._accessToken = null;
    this._refreshToken = null;
    this._expireAt = null;
    this._userId = null;
    Storage.remove('oms_tokens');
  },
  isAuthorized() {
    return !!this._accessToken && (!this._expireAt || Date.now() < this._expireAt);
  },

  // ===== API 请求封装 =====
  async _apiGet(path, params = {}) {
    await this.ensureToken();
    const url = new URL(`${this._baseURL}${path}`);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, v); });
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${this._accessToken}` }
    });
    if (!res.ok) throw new Error(`OMS API ${path} failed: HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(`OMS API ${path} error: ${json.message}`);
    return json.data;
  },

  async _apiPost(path, body = {}) {
    await this.ensureToken();
    const res = await fetch(`${this._baseURL}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`OMS API ${path} failed: HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(`OMS API ${path} error: ${json.message}`);
    return json.data;
  },

  // ===== 业务接口 =====
  // 获取仓库列表
  async getWarehouseList(codes = []) {
    return this._apiPost('/api/warehouse/getList', { codes });
  },

  // 分页获取商品详情
  async getSkuDetail(pageNo = 1, pageSize = 300) {
    return this._apiPost('/api/sku/detail', { pageNo, pageSize });
  },

  // 查询商品库存
  async queryInventory(warehouse, skuList = []) {
    return this._apiPost('/api/inventory/queryInventory', {
      pageNo: 1,
      pageSize: 300,
      warehouse,
      skuList
    });
  }
};
