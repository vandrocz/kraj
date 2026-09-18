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
      ${mentionResults.length === 0 ? '<p class="mention-empty">Piš jméno…</p>'
        : mentionResults.map((u) => `
          <button type="button" class="mention-item" data-action="insert-mention" data-name="${escapeAttr(u.display_name)}">
            ${u.avatar_url ? `<img src="${u.avatar_url}" class="mention-avatar" />` : `<span class="mention-avatar mention-avatar-init">${(u.display_name || '?').charAt(0).toUpperCase()}</span>`}
            <span>${escapeHtml(u.display_name)}</span>
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

function insertMention(name) {
  if (mentionEditor) {
    mentionEditor.focus();
    document.execCommand('insertText', false, `@${name} `);
    const wrap = mentionEditor.closest?.('[data-editor-wrap]');
    if (wrap) { const h = wrap.querySelector('[data-rich-hidden]'); const c = wrap.querySelector('[data-rich-content]'); if (h && c) h.value = c.innerHTML; }
  }
  closeMentionPicker();
}

function closeMentionPicker() {
  mentionPickerEl?.remove();
  mentionPickerEl = null;
  mentionResults = [];
  mentionQuery = '';
}