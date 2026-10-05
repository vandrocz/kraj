// ============================================================
// DM — priame správy
//
// PRAVIDLÁ:
//  - Bežný používateľ (role='user') NEMÔŽE písať inému bežnému používateľovi.
//  - Bežný používateľ MÔŽE kontaktovať organizáciu (role='organization'/'hotelier'/'admin').
//  - Organizácia MÔŽE odpovedať komukoľvek, kto ju kontaktoval (thread už existuje).
//  - Admin môže písať komukoľvek.
//
// Server musí tieto pravidlá vynucovať (endpoint /api/messages/start
// vráti 403, ak ide o user→user). Klient ich kontroluje preventívne,
// aby používateľ dostal zrozumiteľnú hlášku ešte pred requestom.
// ============================================================

let _threadPollInterval = null;

async function loadThreads() {
  if (!isLoggedIn()) return;
  try {
    const data = await apiGet('/api/messages/threads');
    state.threads = data.threads || [];
  } catch (err) {
    state.threads = [];
  }
  if (state.overlay?.type === 'threads') renderApp();
}

/**
 * Skontroluje, či má zmysel začať konverzáciu s daným používateľom.
 * Vráti { ok: true } alebo { ok: false, reason: '...' }.
 */
function _canMessageUser(targetRole) {
  const me = state.user?.role;
  if (!me) return { ok: false, reason: 'notLoggedIn' };
  // Admin môže vždy
  if (me === 'admin') return { ok: true };
  // Organizácia / hotelier môže vždy (odpovedá na existujúce thready alebo iniciuje)
  if (me === 'organization' || me === 'hotelier') return { ok: true };
  // Bežný používateľ → bežný používateľ = ZAKÁZANÉ
  if (targetRole === 'user') return { ok: false, reason: 'userToUserBlocked' };
  // Bežný používateľ → organizácia/hotelier/admin = POVOLENÉ
  return { ok: true };
}

async function openThreadWith(otherUserId) {
  try {
    // Zistí rolu cieľového používateľa (z cache alebo z API)
    let targetRole = null;
    const cached = state.profiles[`user:${otherUserId}`]?.profile;
    if (cached?.role) {
      targetRole = cached.role;
    } else {
      try {
        const d = await apiGet(`/api/profile/user/${otherUserId}`);
        targetRole = d?.profile?.role || null;
        if (d?.profile) state.profiles[`user:${otherUserId}`] = d;
      } catch (e) { /* necháme na serveri */ }
    }

    const check = _canMessageUser(targetRole);
    if (!check.ok) {
      if (check.reason === 'userToUserBlocked') {
        showToast(t('messages.userToUserBlocked') || 'Běžní uživatelé si mezi sebou nemohou psát soukromé zprávy. Kontaktovat lze pouze organizace.');
      } else if (check.reason === 'notLoggedIn') {
        showToast(t('auth.loginRequired') || 'Pro psaní zpráv se musíte přihlásit.');
      }
      return;
    }

    const data = await apiPost('/api/messages/start', { user_id: otherUserId });
    openThreadById(data.thread_id);
  } catch (err) { showToast(err.message); }
}

/**
 * Začne konverzáciu s organizáciou (atrakcia, ubytovanie, gastro…).
 * businessKind: 'organizations' | 'accommodation' | 'restaurants'
 * businessId: ID záznamu v DB (rovnaké, aké sa používa na mape)
 */
async function openThreadWithBusiness(businessKind, businessId, businessName) {
  if (!isLoggedIn()) {
    showToast(t('auth.loginRequired') || 'Pro kontaktování organizace se musíte přihlásit.');
    if (typeof switchTab === 'function') switchTab('account');
    return;
  }
  try {
    const data = await apiPost('/api/messages/start-business', {
      business_kind: businessKind,
      business_id: businessId,
      // Voliteľne pošleme aj názov, aby server mohol thread pomenovať
      business_name: businessName || '',
    });
    openThreadById(data.thread_id);
  } catch (err) {
    showToast(err.message || 'Organizaci se nepodařilo kontaktovat.');
  }
}

function openThreads() {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'threads' };
  state.threads = null;
  pushHistoryState('overlay');
  renderApp();
  loadThreads();
}

function openThreadById(id) {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'thread', id };
  state.threadCurrent = null;
  state.threadMessages = null;
  pushHistoryState('overlay');
  renderApp();
  loadThread(id);
  startThreadPolling(id);
}

function startThreadPolling(id) {
  stopThreadPolling();
  _threadPollInterval = setInterval(() => {
    if (document.hidden) return;
    if (state.overlay?.type === 'thread' && state.overlay.id === id) {
      loadThread(id, true);
    } else {
      stopThreadPolling();
    }
  }, 5000);
}

function stopThreadPolling() {
  if (_threadPollInterval) {
    clearInterval(_threadPollInterval);
    _threadPollInterval = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (state.overlay?.type === 'thread' && state.overlay.id) {
    loadThread(state.overlay.id, true);
  }
});

async function loadThread(id, silent = false) {
  try {
    const data = await apiGet(`/api/messages/thread/${id}`);

    if (state.overlay?.type !== 'thread' || state.overlay.id !== id) return;

    state.threadCurrent = { thread: data.thread, other: data.other };
    state.threadMessages = data.messages || [];

    if (!silent) {
      renderApp();
    } else {
      const scroller = document.getElementById('thread-scroller');
      if (scroller) {
        const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
        renderApp();
        if (atBottom) {
          const ns = document.getElementById('thread-scroller');
          if (ns) ns.scrollTop = ns.scrollHeight;
        }
      }
    }
  } catch (err) {
    if (!silent) showToast(err.message);
  }
}

function renderThreadsOverlay() {
  const list = state.threads;
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('messages.title'))}
      <div class="profile-section">
        ${list == null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
          : list.length === 0 ? `<p class="empty-state">${escapeHtml(t('messages.noThreads'))}</p>`
          : list.map((t) => {
            const isBusiness = t.other?.is_business || t.thread?.business_id;
            const avatar = t.other?.avatar_url || t.other?.logo_url;
            const initial = (t.other?.display_name || t.other?.business_name || '?').charAt(0).toUpperCase();
            return `
            <button class="user-list-item" data-action="open-thread" data-id="${t.id}">
              ${avatar
                ? `<img src="${avatar}" class="user-list-avatar" alt="" />`
                : `<span class="user-list-avatar user-list-avatar-init">${initial}</span>`}
              <div style="flex:1;min-width:0">
                <p class="user-list-name">
                  ${escapeHtml(t.other?.display_name || t.other?.business_name || t('common.unknown'))}
                  ${isBusiness ? `<span class="thread-biz-badge">${icon('check', { size: 10 })} ${escapeHtml(t('messages.businessBadge') || 'Organizace')}</span>` : ''}
                </p>
                <p class="user-list-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${escapeHtml(t.last_message_preview || '—')}</p>
              </div>
              ${t.unread > 0 ? `<span class="nav-badge">${t.unread}</span>` : ''}
              <p class="user-list-meta" style="flex-shrink:0">${t.last_message_at ? timeAgo(t.last_message_at) : ''}</p>
            </button>`;
          }).join('')}
      </div>
    </div>
  `;
}

function renderThreadOverlay() {
  const tc = state.threadCurrent;
  const msgs = state.threadMessages;
  const isBusiness = tc?.other?.is_business || tc?.thread?.business_id;
  const otherName = tc?.other?.display_name || tc?.other?.business_name || t('messages.conversation');
  return `
    <div class="page-scroll thread-scroll" id="thread-scroller">
      ${renderBackHeader(otherName)}
      ${isBusiness ? `<div class="thread-biz-hint">${icon('check', { size: 12 })} ${escapeHtml(t('messages.businessHint') || 'Tato konverzace je s ověřenou organizací na Vandro')}</div>` : ''}
      <div class="thread-messages">
        ${msgs == null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
          : msgs.length === 0 ? `<p class="empty-state">${escapeHtml(t('messages.noMessages'))}</p>`
          : msgs.map((m) => {
            const mine = m.sender_id === state.user.id;
            return `<div class="dm-bubble ${mine ? 'dm-mine' : 'dm-theirs'}">
              <p>${escapeHtml(m.text || '')}</p>
              <span class="dm-time">${timeAgo(m.created_at)}</span>
            </div>`;
          }).join('')}
      </div>
      <form class="thread-input" data-action="submit-thread-message" data-id="${state.overlay.id}">
        <input type="text" class="thread-input-field" placeholder="${escapeAttr(t('messages.writeMessage'))}" data-thread-input autocomplete="off" />
        <button type="submit" class="thread-input-send" aria-label="${escapeAttr(t('messages.send'))}">${icon('send', { size: 20 })}</button>
      </form>
    </div>
  `;
}

async function handleSendThreadMessage(form) {
  const id = form.dataset.id;
  const input = form.querySelector('[data-thread-input]');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    const msg = await apiPost(`/api/messages/thread/${id}/send`, { text });
    if (state.overlay?.type !== 'thread' || state.overlay.id !== id) return;
    state.threadMessages = [...(state.threadMessages || []), { id: msg.id, sender_id: state.user.id, text: msg.text, created_at: msg.created_at }];
    renderApp();
    const scroller = document.getElementById('thread-scroller');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  } catch (err) { showToast(err.message); input.value = text; }
}

// Export pre inline handlery v iných súboroch (vmap-layers.js, profile…)
window.openThreadWith = openThreadWith;
window.openThreadWithBusiness = openThreadWithBusiness;
