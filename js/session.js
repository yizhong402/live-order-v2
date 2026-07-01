/* ===== session.js — 场次管理 ===== */

// ===== 创建新场次 =====
async function createSession(title, date, time, anchor) {
  const session = {
    title,
    date,
    time,
    anchor,
    current_anchor: anchor,
    current_round: 1,
    total_rounds: 0,
    status: 'active',
    start_time: nowISO(),
    created_at: nowISO()
  };
  const result = await BaaS.insert('sessions', session);
  session.id = typeof result === 'number' ? result : (result?.id || result);
  AppState.currentSession = session;
  Storage.set('current_session', session);
  return session;
}

// ===== 加载活跃场次 =====
async function loadActiveSessions() {
  try {
    const sessions = await BaaS.list('sessions', { filter: 'status|eq|active' });
    return sessions || [];
  } catch (e) {
    console.error('加载活跃场次失败:', e);
    return [];
  }
}

// ===== 加载所有场次（含已结束） =====
async function loadAllSessions() {
  try {
    return await BaaS.list('sessions', { orderBy: 'id', orderDir: 'desc' }) || [];
  } catch (e) {
    console.error('加载场次列表失败:', e);
    return [];
  }
}

// ===== 场次选择 =====
async function selectSession(sessionId) {
  try {
    const result = await BaaS.getById('sessions', sessionId);
    if (result && result.data) {
      const s = result.data;
      if (Array.isArray(s) && s.length > 0) {
        AppState.currentSession = s[0];
      } else {
        AppState.currentSession = s;
      }
    } else {
      // fallback: list with filter
      const list = await BaaS.list('sessions', { filter: `id|eq|${sessionId}` });
      if (list && list.length > 0) {
        AppState.currentSession = list[0];
      }
    }
    Storage.set('current_session', AppState.currentSession);
    return AppState.currentSession;
  } catch (e) {
    console.error('选择场次失败:', e);
    return null;
  }
}

// ===== 切换主播 =====
async function switchAnchor(newAnchor) {
  if (!AppState.currentSession) return;
  AppState.currentSession.current_anchor = newAnchor;
  try {
    await BaaS.update('sessions', AppState.currentSession.id, {
      current_anchor: newAnchor
    });
  } catch (e) {
    console.error('切换主播失败:', e);
  }
}

// ===== 更新轮次 =====
async function updateRound(newRound) {
  if (!AppState.currentSession) return;
  AppState.currentSession.current_round = newRound;
  if (newRound > (AppState.currentSession.total_rounds || 0)) {
    AppState.currentSession.total_rounds = newRound;
  }
  try {
    await BaaS.update('sessions', AppState.currentSession.id, {
      current_round: newRound,
      total_rounds: AppState.currentSession.total_rounds
    });
  } catch (e) {
    console.error('更新轮次失败:', e);
  }
}

// ===== 结束场次 =====
async function endSession() {
  if (!AppState.currentSession) return;
  AppState.currentSession.status = 'ended';
  try {
    await BaaS.update('sessions', AppState.currentSession.id, { status: 'ended' });
    Storage.remove('current_session');
AppState.currentSession = null;
  } catch (e) {
    console.error('结束场次失败:', e);
  }
}

// ===== 恢复上次场次 =====
function restoreSession() {
  const saved = Storage.get('current_session');
  if (saved && saved.status === 'active') {
    AppState.currentSession = saved;
    return saved;
  }
  return null;
}
