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

let emojiTargetEditor = null;

function openEmojiPicker() {
  emojiTargetEditor = document.activeElement;
  const existing = document.getElementById('emoji-picker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'emoji-picker';
  picker.className = 'emoji-picker';
  picker.innerHTML = `
    <div class="emoji-picker-head">
      <span>Emoji</span>
      <button type="button" class="emoji-picker-close" data-action="close-emoji">${icon('close', { size: 16 })}</button>
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
  if (emojiTargetEditor && document.activeElement !== emojiTargetEditor) {
    emojiTargetEditor.focus();
  }
  document.execCommand('insertText', false, emoji);
  const wrap = document.activeElement.closest?.('[data-editor-wrap]');
  if (wrap) { const h = wrap.querySelector('[data-rich-hidden]'); const c = wrap.querySelector('[data-rich-content]'); if (h && c) h.value = c.innerHTML; }
}
