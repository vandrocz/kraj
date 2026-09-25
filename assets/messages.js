// ============================================================
// DM — i18n verzia
// ============================================================

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

async function openThreadWith(otherUserId) {
  try {
    const data = await apiPost('/api/messages/start', { user_id: otherUserId });
    openThreadById(data.thread_id);
  } catch (err) { showToast(err.message); }
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

let _threadPollInterval = null;
function startThreadPolling(id) {
  stopThreadPolling();
  _threadPollInterval = setInterval(() => { if (state.overlay?.type === 'thread' && state.overlay.id === id) loadThread(id, true); }, 5000);
}
function stopThreadPolling() {
  if (_threadPollInterval) clearInterval(_threadPollInterval);
  _threadPollInterval = null;
}

async function loadThread(id, silent = false) {
  try {
    const data = await apiGet(`/api/messages/thread/${id}`);
    state.threadCurrent = { thread: data.thread, other: data.other };
    state.threadMessages = data.messages || [];
    if (!silent && state.overlay?.type === 'thread') renderApp();
    else if (silent && state.overlay?.type === 'thread') {
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
          : list.map((t) => `
            <button class="user-list-item" data-action="open-thread" data-id="${t.id}">
              ${t.other?.avatar_url
                ? `<img src="${t.other.avatar_url}" class="user-list-avatar" alt="" />`
                : `<span class="user-list-avatar user-list-avatar-init">${(t.other?.display_name || '?').charAt(0).toUpperCase()}</span>`}
              <div style="flex:1;min-width:0">
                <p class="user-list-name">${escapeHtml(t.other?.display_name || t('common.unknown'))}</p>
                <p class="user-list-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${escapeHtml(t.last_message_preview || '—')}</p>
              </div>
              ${t.unread > 0 ? `<span class="nav-badge">${t.unread}</span>` : ''}
              <p class="user-list-meta" style="flex-shrink:0">${t.last_message_at ? timeAgo(t.last_message_at) : ''}</p>
            </button>`).join('')}
      </div>
    </div>
  `;
}

function renderThreadOverlay() {
  const tc = state.threadCurrent;
  const msgs = state.threadMessages;
  return `
    <div class="page-scroll thread-scroll" id="thread-scroller">
      ${renderBackHeader(tc?.other?.display_name || t('messages.conversation'))}
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
    state.threadMessages = [...(state.threadMessages || []), { id: msg.id, sender_id: state.user.id, text: msg.text, created_at: msg.created_at }];
    renderApp();
    const scroller = document.getElementById('thread-scroller');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  } catch (err) { showToast(err.message); input.value = text; }
}
