// ============================================================
// RICH-TEXT EDITOR (contenteditable + toolbar)
// ============================================================

function renderRichEditor(name = 'text_html', placeholder = 'Co je nového?', initialHtml = '') {
  return `
    <div class="rich-editor" data-editor-wrap>
      <div class="rich-toolbar">
        <button type="button" class="rich-btn" data-action="rich-cmd" data-cmd="bold" title="Tučné"><b>B</b></button>
        <button type="button" class="rich-btn" data-action="rich-cmd" data-cmd="italic" title="Kurzíva"><i>I</i></button>
        <button type="button" class="rich-btn" data-action="rich-cmd" data-cmd="underline" title="Podtržené"><u>U</u></button>
        <button type="button" class="rich-btn" data-action="rich-cmd" data-cmd="strikeThrough" title="Přeškrtnuté"><s>S</s></button>
        <span class="rich-sep"></span>
        <button type="button" class="rich-btn" data-action="rich-cmd" data-cmd="insertUnorderedList" title="Odrážky">•</button>
        <button type="button" class="rich-btn" data-action="rich-cmd" data-cmd="insertOrderedList" title="Číslovaný">1.</button>
        <span class="rich-sep"></span>
        <button type="button" class="rich-btn" data-action="rich-link" title="Odkaz">🔗</button>
        <button type="button" class="rich-btn" data-action="rich-emoji" title="Emoji">😀</button>
      </div>
      <div class="rich-content" contenteditable="true" data-rich-content data-placeholder="${escapeAttr(placeholder)}">${initialHtml || ''}</div>
      <input type="hidden" name="${name}" data-rich-hidden value="${escapeAttr(initialHtml || '')}" />
    </div>`;
}

/**
 * Pripojí listenery na rich editor. Volané z renderApp() pre každý .rich-editor.
 * Idempotentné — bezpečne sa dá volať viackrát.
 */
function bindRichEditor(wrap) {
  if (!wrap || wrap.dataset.editorBound === '1') return;
  wrap.dataset.editorBound = '1';

  const content = wrap.querySelector('[data-rich-content]');
  const hidden = wrap.querySelector('[data-rich-hidden]');
  if (!content || !hidden) return;

  const sync = () => { hidden.value = content.innerHTML; };

  content.addEventListener('input', () => {
    sync();
    // Ak je otvorený mention picker, updatuj jeho query podľa textu pred kurzorom
    if (mentionPickerEl && mentionEditor === content) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType === 3) {
          const textBefore = node.textContent.slice(0, range.startOffset);
          const m = textBefore.match(/@([a-zA-Z0-9._-]{0,40})$/);
          if (m) onMentionInput(m[1]);
          else closeMentionPicker();
        } else {
          closeMentionPicker();
        }
      }
    }
  });
  content.addEventListener('blur', sync);

  content.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
    sync();
  });

  content.addEventListener('keydown', (e) => {
    if (e.key === '@') {
      setTimeout(() => {
        openMentionPicker(content);
        onMentionInput('');
      }, 10);
    } else if (e.key === 'Escape') {
      closeMentionPicker();
    }
  });

  sync();
}

/**
 * Prejde všetky rich editory v DOM a pripojí im listenery. Volané po každom renderApp().
 */
function bindAllRichEditors(root = document) {
  root.querySelectorAll('[data-editor-wrap]').forEach((wrap) => bindRichEditor(wrap));
}

function richCmd(cmd) {
  document.execCommand(cmd, false, null);
  const active = document.activeElement;
  const wrap = active?.closest?.('[data-editor-wrap]');
  if (wrap) {
    const h = wrap.querySelector('[data-rich-hidden]');
    const c = wrap.querySelector('[data-rich-content]');
    if (h && c) h.value = c.innerHTML;
  }
  return false;
}

function richLink() {
  const url = prompt('URL odkazu (https://...)');
  if (!url) return false;
  const safe = /^https?:\/\//i.test(url) ? url : 'https://' + url;
  document.execCommand('createLink', false, safe);
  // Pridaj target/rel na novo-vložený link
  const active = document.activeElement;
  const wrap = active?.closest?.('[data-editor-wrap]');
  if (wrap) {
    const content = wrap.querySelector('[data-rich-content]');
    if (content) {
      content.querySelectorAll('a:not([target])').forEach((a) => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener nofollow ugc');
      });
      const h = wrap.querySelector('[data-rich-hidden]');
      if (h) h.value = content.innerHTML;
    }
  }
  return false;
}

function richEmoji() {
  openEmojiPicker();
  return false;
}

function getEditorHtml(form) {
  const c = form.querySelector('[data-rich-content]');
  return c ? c.innerHTML : '';
}

function setEditorHtml(form, html) {
  const c = form.querySelector('[data-rich-content]');
  if (c) c.innerHTML = html || '';
}
