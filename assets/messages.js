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

// Počet nepřečtených zpráv (odznak u ikony zpráv v hlavičce)
async function loadUnreadMessages() {
  if (typeof isLoggedIn !== 'function' || !isLoggedIn()) { state.unreadMessages = 0; return; }
  try {
    const d = await apiGet('/api/messages/unread-count');
    const n = Number(d.unread) || 0;
    if (n !== state.unreadMessages) {
      state.unreadMessages = n;
      document.querySelectorAll('[data-dm-badge]').forEach((el) => {
        el.textContent = n > 9 ? '9+' : String(n);
        el.style.display = n > 0 ? '' : 'none';
      });
    }
  } catch { /* offline nebo vypršelé přihlášení */ }
}
window.loadUnreadMessages = loadUnreadMessages;
setInterval(() => { if (!document.hidden) loadUnreadMessages(); }, 60000);
window.addEventListener('load', () => { setTimeout(loadUnreadMessages, 1500); });

// Tlačítko Zprávy do hlavičky (sdílí ho feedy, akce i účet)
function renderMessagesButton() {
  if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return '';
  const n = Number(state.unreadMessages) || 0;
  return `<button class="header-icon-btn" data-action="open-threads" style="position:relative" aria-label="${escapeAttr(t('messages.title'))}">
    ${icon('chat', { size: 19 })}
    <span class="nav-badge" data-dm-badge style="${n > 0 ? '' : 'display:none'}">${n > 9 ? '9+' : n}</span>
  </button>`;
}
window.renderMessagesButton = renderMessagesButton;

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
  loadThreads().then(() => loadUnreadMessages());
}

function openThreadById(id) {
  state.threadDraft = "";
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'thread', id };
  state.threadCurrent = null;
  state.threadMessages = null;
  pushHistoryState('overlay');
  renderApp();
  loadThread(id).then(() => loadUnreadMessages());
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

function threadMessagesHtml(msgs) {
  if (msgs == null) return `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`;
  if (msgs.length === 0) return `<p class="empty-state">${escapeHtml(t('messages.noMessages'))}</p>`;
  const myId = state.user && state.user.id;
  return msgs.map((m) => {
    const mine = !!myId && m.sender_id === myId;
    return `<div class="dm-bubble ${mine ? 'dm-mine' : 'dm-theirs'}${m.__pending ? ' is-pending' : ''}">
      <p>${escapeHtml(m.text || '')}</p>
      <span class="dm-time">${m.__pending ? '…' : timeAgo(m.created_at)}</span>
    </div>`;
  }).join('');
}

function scrollThreadToBottom() {
  const sc = document.getElementById('thread-messages');
  if (sc) sc.scrollTop = sc.scrollHeight;
}

// Překreslí jen seznam zpráv (ne celou aplikaci), takže se neztratí rozepsaný text ani fokus v poli
function updateThreadMessagesDOM(forceBottom) {
  const box = document.getElementById('thread-messages');
  if (!box) return false;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = threadMessagesHtml(state.threadMessages);
  if (forceBottom || atBottom) scrollThreadToBottom();
  return true;
}

async function loadThread(id, silent = false) {
  try {
    const data = await apiGet(`/api/messages/thread/${id}`);
    if (state.overlay?.type !== 'thread' || state.overlay.id !== id) return;

    state.threadCurrent = { thread: data.thread, other: data.other, blocked_by_me: !!data.blocked_by_me, blocked_me: !!data.blocked_me };
    const pending = (state.threadMessages || []).filter((m) => m.__pending);
    state.threadMessages = [...(data.messages || []), ...pending];

    // záhlaví (jméno, hint) a seznam zpráv existují už z prvního vykreslení → stačí aktualizovat zprávy
    if (silent && updateThreadMessagesDOM(false)) return;
    renderApp();
    scrollThreadToBottom();
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
          : list.map((th) => {
            const other = th.other || {};
            const isBusiness = !!other.is_business;
            const title = other.business_name || other.display_name || t('common.unknown');
            const avatar = other.avatar_url;
            const initial = String(title || '?').charAt(0).toUpperCase();
            return `
            <button class="user-list-item" data-action="open-thread" data-id="${escapeAttr(th.id)}">
              ${avatar
                ? `<img src="${escapeAttr(avatar)}" class="user-list-avatar" alt="" />`
                : `<span class="user-list-avatar user-list-avatar-init">${escapeHtml(initial)}</span>`}
              <div style="flex:1;min-width:0">
                <p class="user-list-name">
                  ${escapeHtml(title)}
                  ${isBusiness ? `<span class="thread-biz-badge">${icon('check', { size: 10 })} ${escapeHtml(t('messages.businessBadge'))}</span>` : ''}
                </p>
                <p class="user-list-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${escapeHtml(th.last_message_preview || '—')}</p>
              </div>
              ${th.unread > 0 ? `<span class="nav-badge" style="position:static">${th.unread > 9 ? '9+' : th.unread}</span>` : ''}
              <p class="user-list-meta" style="flex-shrink:0">${th.last_message_at ? timeAgo(th.last_message_at) : ''}</p>
            </button>`;
          }).join('')}
      </div>
    </div>
  `;
}

function renderThreadOverlay() {
  const tc = state.threadCurrent;
  const msgs = state.threadMessages;
  const other = tc?.other || {};
  const isBusiness = !!other.is_business;
  const bizName = other.business_name || '';
  const otherName = bizName || other.display_name || t('messages.conversation');
  const blockedByMe = !!tc?.blocked_by_me;
  const blockedMe = !!tc?.blocked_me;

  const menuBtn = other.id ? `
    <div class="thread-menu-wrap">
      <button class="header-icon-btn" data-action="thread-menu" aria-label="${escapeAttr(t('messages.menu'))}" aria-expanded="${!!state._threadMenu}">${icon('more', { size: 20 })}</button>
      ${state._threadMenu ? `
        <div class="thread-menu" role="menu">
          ${blockedByMe
            ? `<button role="menuitem" data-action="thread-unblock">${icon('check', { size: 16 })} ${escapeHtml(t('messages.unblock'))}</button>`
            : `<button role="menuitem" data-action="thread-block" class="is-danger">${icon('ban', { size: 16 })} ${escapeHtml(t('messages.block'))}</button>`}
          <button role="menuitem" data-action="report-user" data-id="${escapeAttr(other.id)}" class="is-danger">${icon('flag', { size: 16 })} ${escapeHtml(t('messages.report'))}</button>
        </div>` : ''}
    </div>` : '';

  const composer = (blockedByMe || blockedMe)
    ? `<div class="thread-blocked-note">
         <p>${escapeHtml(blockedByMe ? t('messages.blockedByMe') : t('messages.blockedMe'))}</p>
         ${blockedByMe ? `<button class="thread-unblock-btn" data-action="thread-unblock">${escapeHtml(t('messages.unblock'))}</button>` : ''}
       </div>`
    : `<form class="thread-input" data-action="submit-thread-message" data-id="${escapeAttr(state.overlay.id)}">
         <input type="text" class="thread-input-field" placeholder="${escapeAttr(t('messages.writeMessage'))}" data-thread-input autocomplete="off" value="${escapeAttr(state.threadDraft || '')}" enterkeyhint="send" />
         <button type="submit" class="thread-input-send" aria-label="${escapeAttr(t('messages.send'))}">${icon('send', { size: 20 })}</button>
       </form>`;

  return `
    <div class="thread-view" id="thread-view">
      ${renderBackHeader(otherName, menuBtn)}
      ${isBusiness ? `<div class="thread-biz-hint">${icon('check', { size: 12 })} ${escapeHtml(t('messages.businessHint'))}${bizName && other.display_name ? ` · ${escapeHtml(other.display_name)}` : ''}</div>` : ''}
      <div class="thread-messages" id="thread-messages">${threadMessagesHtml(msgs)}</div>
      ${composer}
    </div>
  `;
}

async function handleSendThreadMessage(form) {
  const id = form.dataset.id;
  const input = form.querySelector('[data-thread-input]');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  if (form.dataset.sending === '1') return;
  form.dataset.sending = '1';

  input.value = '';
  state.threadDraft = '';
  const tempId = 'tmp_' + Date.now();
  const myId = state.user && state.user.id;
  state.threadMessages = [...(state.threadMessages || []), { id: tempId, sender_id: myId, text, created_at: new Date().toISOString(), __pending: true }];
  updateThreadMessagesDOM(true);
  input.focus();

  try {
    const msg = await apiPost(`/api/messages/thread/${id}/send`, { text });
    if (state.overlay?.type === 'thread' && state.overlay.id === id) {
      state.threadMessages = (state.threadMessages || []).map((m) =>
        m.id === tempId ? { id: msg.id, sender_id: myId, text: msg.text || text, created_at: msg.created_at } : m);
      updateThreadMessagesDOM(true);
    }
    loadThreads && state.threads && loadThreads();
  } catch (err) {
    state.threadMessages = (state.threadMessages || []).filter((m) => m.id !== tempId);
    updateThreadMessagesDOM(true);
    const f = document.querySelector('[data-thread-input]');
    if (f && !f.value) f.value = text;
    showToast(err.message || t('errors.generic'));
  } finally {
    form.dataset.sending = '0';
  }
}

// Export pre inline handlery v iných súboroch (vmap-layers.js, profile…)
window.openThreadWith = openThreadWith;
window.openThreadWithBusiness = openThreadWithBusiness;


// Rozepsaná zpráva přežije i překreslení celé aplikace (např. při načtení notifikací) včetně fokusu v poli
document.addEventListener('input', (e) => {
  if (e.target && e.target.matches && e.target.matches('[data-thread-input]')) state.threadDraft = e.target.value;
});
(function keepThreadInputFocus() {
  const original = window.renderApp;
  if (typeof original !== 'function' || original.__keepsThreadFocus) return;
  const wrapped = function () {
    const el = document.activeElement;
    const had = !!(el && el.matches && el.matches('[data-thread-input]'));
    const pos = had ? el.selectionStart : null;
    const result = original.apply(this, arguments);
    if (had) {
      const n = document.querySelector('[data-thread-input]');
      if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
    }
    return result;
  };
  wrapped.__keepsThreadFocus = true;
  window.renderApp = wrapped;
})();


// ---- Menu konverzace: zablokování, odblokování, nahlášení ----
function toggleThreadMenu() { state._threadMenu = !state._threadMenu; renderApp(); }

function threadBlockUser() {
  const other = state.threadCurrent && state.threadCurrent.other;
  if (!other || !other.id) return;
  state._threadMenu = false;
  openModal({
    title: t('messages.blockTitle'),
    body: `<p style="font-size:14px;line-height:1.6">${escapeHtml(t('messages.blockConfirm'))}</p>`,
    submitLabel: t('messages.block'),
    danger: true,
    onSubmit: async () => {
      state._modalLoading = true; renderApp();
      try {
        await apiPost(`/api/profile/block/${encodeURIComponent(other.id)}`, {});
        closeModal();
        if (state.threadCurrent) state.threadCurrent.blocked_by_me = true;
        showToast(t('toasts.blocked'));
      } catch (err) { showToast(err.message); }
      state._modalLoading = false; renderApp();
    },
  });
}

async function threadUnblockUser() {
  const other = state.threadCurrent && state.threadCurrent.other;
  if (!other || !other.id) return;
  state._threadMenu = false;
  try {
    await apiDelete(`/api/profile/block/${encodeURIComponent(other.id)}`);
    if (state.threadCurrent) state.threadCurrent.blocked_by_me = false;
    showToast(t('toasts.unblocked'));
  } catch (err) { showToast(err.message); }
  renderApp();
}

// Klepnutí mimo menu ho zavře
document.addEventListener('pointerdown', (e) => {
  if (!state._threadMenu) return;
  if (e.target && e.target.closest && e.target.closest('.thread-menu-wrap')) return;
  state._threadMenu = false;
  renderApp();
}, true);

// Okno konverzace sleduje skutečně viditelnou plochu (lišty prohlížeče, klávesnice), takže pole pro psaní nezůstane schované dole
function fitThreadToViewport() {
  const el = document.getElementById('thread-view');
  const vv = window.visualViewport;
  if (!el) return;
  if (vv) {
    el.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    el.style.setProperty('--vv-top', Math.round(vv.offsetTop) + 'px');
  }
}
if (window.visualViewport) {
  const onVV = () => {
    fitThreadToViewport();
    const box = document.getElementById('thread-messages');
    if (box && document.activeElement && document.activeElement.hasAttribute('data-thread-input')) scrollThreadToBottom();
  };
  window.visualViewport.addEventListener('resize', onVV);
  window.visualViewport.addEventListener('scroll', onVV);
}
(function keepThreadViewportFit() {
  const original = window.renderApp;
  if (typeof original !== 'function') return;
  const wrapped = function () { const r = original.apply(this, arguments); fitThreadToViewport(); return r; };
  wrapped.__keepsThreadFocus = original.__keepsThreadFocus;
  window.renderApp = wrapped;
})();
