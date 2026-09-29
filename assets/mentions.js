// ============================================================
// MENTIONS — @zmienky v rich editore
// ============================================================

let mentionPickerEl = null;
let mentionQuery = '';
let mentionResults = [];
let mentionTimer = null;
let mentionEditor = null;

function openMentionPicker(editorEl) {
  mentionEditor = editorEl;
  mentionQuery = '';
  mentionResults = [];
  renderMentionPicker();
  // Po prvom otvorení počúvaj klik mimo
  if (!openMentionPicker._outsideBound) {
    openMentionPicker._outsideBound = true;
    document.addEventListener('mousedown', (e) => {
      if (!mentionPickerEl) return;
      if (mentionPickerEl.contains(e.target)) return;
      closeMentionPicker();
    });
  }
}

function renderMentionPicker() {
  if (!mentionPickerEl) {
    mentionPickerEl = document.createElement('div');
    mentionPickerEl.id = 'mention-picker';
    mentionPickerEl.className = 'mention-picker';
    document.body.appendChild(mentionPickerEl);
  }
  mentionPickerEl.innerHTML = `
    <div class="mention-picker-head">Zmínit uživatele</div>
    <div class="mention-picker-list">
      ${mentionResults.length === 0
        ? '<p class="mention-empty">Piš jméno…</p>'
        : mentionResults.map((u) => `
          <button type="button" class="mention-item" data-action="insert-mention" data-name="${escapeAttr(u.display_name)}" data-handle="${escapeAttr(u.handle || '')}">
            ${u.avatar_url
              ? `<img src="${escapeAttr(u.avatar_url)}" class="mention-avatar" alt="" />`
              : `<span class="mention-avatar mention-avatar-init">${(u.display_name || '?').charAt(0).toUpperCase()}</span>`}
            <span>${escapeHtml(u.display_name)}${u.handle ? ` <small style="opacity:.6">@${escapeHtml(u.handle)}</small>` : ''}</span>
          </button>`).join('')}
    </div>
  `;
}

function onMentionInput(value) {
  mentionQuery = value;
  clearTimeout(mentionTimer);
  if (!value || value.length < 1) { mentionResults = []; renderMentionPicker(); return; }
  mentionTimer = setTimeout(async () => {
    try {
      const data = await apiGet(`/api/mentions/search?q=${encodeURIComponent(value)}`);
      mentionResults = data.users || [];
    } catch { mentionResults = []; }
    renderMentionPicker();
  }, 220);
}

function insertMention(name, handle) {
  if (mentionEditor) {
    mentionEditor.focus();
    // Vlož handle ak existuje, inak display_name
    const tag = handle || name;
    document.execCommand('insertText', false, `@${tag} `);
    const wrap = mentionEditor.closest?.('[data-editor-wrap]');
    if (wrap) {
      const h = wrap.querySelector('[data-rich-hidden]');
      const c = wrap.querySelector('[data-rich-content]');
      if (h && c) h.value = c.innerHTML;
    }
  }
  closeMentionPicker();
}

function closeMentionPicker() {
  if (mentionPickerEl) {
    mentionPickerEl.remove();
    mentionPickerEl = null;
  }
  mentionResults = [];
  mentionQuery = '';
}
