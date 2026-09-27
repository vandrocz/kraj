// ============================================================
// EMOJI PICKER
// ============================================================

const EMOJI_SET = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚',
  '😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣',
  '😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗',
  '🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐',
  '🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟',
  '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤝','🙏',
  '🎉','🎊','🎈','🎁','🎂','🍰','🍕','🍔','🍟','🌭','🍿','🍺','🍻','🥂','🍷','☕','🍵','🍩','🍪','🍫',
  '⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🎯','🎮','🎲','🎸','🎹','🎺','🎻','🥁','🎤',
  '🌟','⭐','✨','⚡','🔥','💥','❄️','🌈','☀️','🌤','⛅','🌧','⛈','🌩','🌨','☔','🌊','💧','🌙','🌚',
  '🌍','🌎','🌏','🗺','🏔','🌋','🏝','🏖','🏕','🏞','🌲','🌳','🌴','🌵','🌷','🌹','🌺','🌻','🌼','🌸',
];

// Uložíme si referenciu na contenteditable, do ktorého vložíme emoji
let emojiTargetEditor = null;

function openEmojiPicker() {
  // Zapamätaj si AKTÍVNY contenteditable (alebo input/textarea)
  const active = document.activeElement;
  if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    emojiTargetEditor = active;
  } else {
    // Fallback — prvý contenteditable v DOM (rich editor)
    emojiTargetEditor = document.querySelector('[data-rich-content]');
  }

  // Zavri predchádzajúci picker
  document.getElementById('emoji-picker')?.remove();

  const picker = document.createElement('div');
  picker.id = 'emoji-picker';
  picker.className = 'emoji-picker';
  picker.innerHTML = `
    <div class="emoji-picker-head">
      <span>Emoji</span>
      <button type="button" class="emoji-picker-close" data-action="close-emoji" aria-label="Zavřít">${icon('close', { size: 16 })}</button>
    </div>
    <div class="emoji-picker-grid">
      ${EMOJI_SET.map((e) => `<button type="button" class="emoji-cell" data-action="insert-emoji" data-emoji="${e}">${e}</button>`).join('')}
    </div>
  `;
  document.body.appendChild(picker);
}

function closeEmojiPicker() {
  document.getElementById('emoji-picker')?.remove();
}

function insertEmoji(emoji) {
  const editor = emojiTargetEditor || document.querySelector('[data-rich-content]');
  if (!editor) {
    closeEmojiPicker();
    return;
  }

  // Fokus
  try { editor.focus(); } catch {}

  // Ak je to contenteditable → použi execCommand
  if (editor.isContentEditable) {
    // Obnov výber — niekedy klik na emoji picker stratí selection
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('insertText', false, emoji);

    // Sync hidden input rich editora
    const wrap = editor.closest?.('[data-editor-wrap]');
    if (wrap) {
      const h = wrap.querySelector('[data-rich-hidden]');
      if (h) h.value = editor.innerHTML;
    }
  } else if (editor.tagName === 'INPUT' || editor.tagName === 'TEXTAREA') {
    // Input / textarea — vlož na pozíciu kurzora
    const start = editor.selectionStart ?? editor.value.length;
    const end = editor.selectionEnd ?? editor.value.length;
    const val = editor.value;
    editor.value = val.slice(0, start) + emoji + val.slice(end);
    editor.selectionStart = editor.selectionEnd = start + emoji.length;
    // Spusti input event, aby sa sync-ol state
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // NEROB closeEmojiPicker() — nechaj otvorené, aby mohol user pridať viac emoji
  // (rovnako ako na Facebooku / Instagrame)
}
