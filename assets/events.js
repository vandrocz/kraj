document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'set-tab': switchTab(el.dataset.tab); break;
    case 'open-lightbox': {
      e.preventDefault();
      const img = el.dataset.img, caption = el.dataset.caption;
      const lb = document.getElementById('lightbox');
      if (!lb) break;
      document.getElementById('lightbox-img').src = img;
      document.getElementById('lightbox-img').alt = caption || '';
      document.getElementById('lightbox-caption').textContent = caption || '';
      lb.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      break;
    }
    case 'close-lightbox':
      document.getElementById('lightbox')?.classList.remove('is-open');
      document.body.style.overflow = '';
      break;
    case 'open-detail': {
      const id = el.dataset.id, source = el.dataset.source;
      const project = source === 'active' ? state.collections.active : state.collections.waiting.find((p) => p.id === id);
      if (!project) break;
      document.getElementById('detail-sheet').innerHTML = buildDetailSheetHtml(project);
      document.getElementById('detail-modal').classList.add('is-open');
      document.body.style.overflow = 'hidden';
      break;
    }
    case 'close-detail':
      document.getElementById('detail-modal')?.classList.remove('is-open');
      document.body.style.overflow = '';
      break;
    case 'like-collection': likeCollection(el.dataset.id, el); break;
    case 'toggle-comments': toggleSocialComments(el.dataset.id, el.dataset.feed); break;
    case 'toggle-post-like': togglePostLike(el.dataset.id, el.dataset.feed, el); break;
    case 'share-post': sharePost(el.dataset.id, el.dataset.text); break;
    case 'report-post': reportPost(el.dataset.id); break;
    case 'open-profile': if (el.dataset.id) openProfile(el.dataset.kind, el.dataset.id); break;
    case 'close-overlay': closeOverlay(); break;
    case 'clear-overlay': clearOverlay(); break;
    case 'open-settings': openSettings(); break;
    case 'open-security': openSecurity(); break;
    case 'open-notifications': openNotifications(); break;
    case 'open-search': openSearch(); break;
    case 'open-blocks': openBlocks(); break;
    case 'open-followers': openFollowers(el.dataset.kind === 'user' ? 'user' : el.dataset.kind, el.dataset.id); break;
    case 'open-following': openFollowing(); break;
    case 'open-forgot': openForgotPassword(); break;
    case 'open-login-logs': openLoginLogs(); break;
    case 'open-threads': openThreads(); break;
    case 'open-thread': openThreadById(el.dataset.id); break;
    case 'open-groups': openGroups(); break;
    case 'open-group': openGroupDetail(el.dataset.id); break;
    case 'open-create-group': handleCreateGroup(); break;
    case 'join-group': joinGroup(el.dataset.id); break;
    case 'leave-group': leaveGroup(el.dataset.id); break;
    case 'open-post': openPostFromProfile(el.dataset.postId, el.dataset.kind, el.dataset.id); break;
    case 'toggle-follow': toggleFollow(el.dataset.kind === 'user' ? 'user' : el.dataset.kind, el.dataset.id); break;
    case 'read-all-notifications': markAllNotificationsRead(); break;
    case 'block-user': blockUser(el.dataset.id); break;
    case 'unblock-user': unblockUser(el.dataset.id); break;
    case 'delete-post': deletePost(el.dataset.id, el.dataset.feed); break;
    case 'delete-comment': deleteComment(el.dataset.id, el.dataset.feed, el.dataset.postId); break;
    case 'resend-verification': resendVerification(); break;
    case 'delete-account': promptDeleteAccount(); break;
    case 'export-data': exportMyData(); break;
    case 'edit-profile':
      state.overlay = { type: 'profile', kind: el.dataset.kind, id: el.dataset.id, edit: true, editKind: el.dataset.kind, editId: el.dataset.id };
      renderApp(); break;
    case 'upload-avatar': uploadProfileImage(el.dataset.target, el.dataset.targetId, el.dataset.field); break;
    case 'set-auth-view': state.authView = el.dataset.view; accountFormState.formError = ''; renderApp(); break;
    case 'set-register-role': accountFormState.registerRole = el.dataset.role; renderApp(); break;
    case 'set-business-kind': accountFormState.registerBusinessKind = el.dataset.kind; renderApp(); break;
    case 'logout': handleLogout(); break;
    case 'topup': handleTopup(parseInt(el.dataset.amount, 10)); break;
    case 'select-business': selectBusiness(el.dataset.id); break;
    case 'trigger-file-input': document.getElementById('post-file-input')?.click(); break;
    case 'remove-post-file': removePostFile(el.dataset.name); break;
    case 'verify-business': verifyBusiness(el.dataset.kind, el.dataset.id); break;
    case 'delete-reported-post': deleteReportedPost(el.dataset.postId, el.dataset.reportId); break;
    case 'start-2fa-setup': start2FASetup(); break;
    case 'finish-2fa-setup': finish2FASetup(); break;
    case 'dm-user': openThreadWith(el.dataset.id); break;
    case 'dm-business-owner':
      (async () => {
        try {
          const data = await apiGet(`/api/profile/${el.dataset.kind}/${el.dataset.id}`);
          const ownerId = data.profile.user_id;
          if (ownerId) openThreadWith(ownerId);
        } catch (err) { showToast('Nepodařilo se otevřít konverzaci.'); }
      })();
      break;
    case 'open-story-viewer': openStoryViewer(el.dataset.groupKey); break;
    case 'open-create-story': openCreateStory(); break;
    case 'close-story-viewer': closeStoryViewer(); break;
    case 'story-next': storyNext(); break;
    case 'story-prev': storyPrev(); break;
    case 'trigger-story-file': document.getElementById('story-file-input')?.click(); break;
    case 'rich-cmd': richCmd(el.dataset.cmd); break;
    case 'rich-link': richLink(); break;
    case 'rich-emoji': richEmoji(); break;
    case 'close-emoji': closeEmojiPicker(); break;
    case 'insert-emoji': insertEmoji(el.dataset.emoji); break;
    case 'insert-mention': insertMention(el.dataset.name); break;
    case 'attach-geo':
      (async () => {
        const loc = await attachLocationToPost();
        if (loc) {
          const f = document.querySelector('[data-action="submit-business-post"]');
          if (f) { f.dataset.geoLat = loc.lat; f.dataset.geoLng = loc.lng; f.dataset.geoPlace = loc.place; }
          const btn = document.querySelector('[data-geo-label]');
          if (btn) btn.textContent = `📍 ${loc.place}`;
        }
      })();
      break;
  }
});

document.addEventListener('click', (e) => {
  if (e.target.id === 'detail-modal') { e.target.classList.remove('is-open'); document.body.style.overflow = ''; }
});

document.addEventListener('scroll', (e) => {
  const track = e.target.closest?.('[data-carousel-track]');
  if (!track) return;
  const carousel = track.closest('[data-post-carousel]');
  if (!carousel) return;
  const idx = Math.round(track.scrollLeft / track.clientWidth);
  carousel.querySelectorAll('.post-carousel-dot').forEach((d, i) => d.classList.toggle('is-active', i === idx));
}, true);

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'filter-change') onFilterChange(el.dataset.feed, el.dataset.field, el.value);
  else if (a === 'region-select-change') onRegionSelectChangeForDistrict(el);
  else if (a === 'edit-region-change') {
    const form = el.closest('form');
    const dist = form.querySelector('select[name="district"]');
    const opts = REGIONS[el.value] || [];
    dist.innerHTML = opts.map((d) => `<option value="${d}">${d}</option>`).join('');
  }
  else if (a === 'files-selected') onFilesSelected(el);
  else if (a === 'file-selected') onFileSelected(el);
  else if (a === 'setting-toggle') toggleSetting(el.dataset.key, el.checked);
  else if (a === 'story-file-selected') onStoryFileSelected(el);
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'search-change') { onSearchChange(el.dataset.feed, el.value); return; }
  if (el.dataset.action === 'search-global') { onGlobalSearchInput(el.value); }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-action]');
  if (!form) return;
  e.preventDefault();
  const a = form.dataset.action;
  if (a === 'submit-login') handleLoginSubmit(form);
  else if (a === 'submit-register') handleRegisterSubmit(form);
  else if (a === 'submit-business-post') handleBusinessPostSubmit(form);
  else if (a === 'submit-edit-profile') handleEditProfileSubmit(form);
  else if (a === 'submit-social-comment') {
    const id = form.dataset.id, feed = form.dataset.feed;
    const input = form.querySelector(`[data-comment-input="${id}"]`);
    submitSocialComment(id, feed, input.value, input);
  }
  else if (a === 'submit-forgot') handleForgotSubmit(form);
  else if (a === 'submit-reset') handleResetSubmit(form);
  else if (a === 'submit-2fa-login') handleTwoFALogin(form);
  else if (a === 'submit-enable-2fa') submitEnable2FA(form);
  else if (a === 'submit-disable-2fa') submitDisable2FA(form);
  else if (a === 'submit-thread-message') handleSendThreadMessage(form);
  else if (a === 'submit-group-post') handleGroupPostSubmit(form);
  else if (a === 'submit-create-story') handleCreateStorySubmit(form);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('lightbox')?.classList.remove('is-open');
    document.getElementById('detail-modal')?.classList.remove('is-open');
    document.body.style.overflow = '';
    if (state.overlay) closeOverlay();
  }
});

async function bootstrap() {
  renderApp();
  await loadMetaFromApi();
  renderApp();
  loadCollections();
  if (isLoggedIn()) { loadWallet(); loadNotifications(); loadStoriesFeed(); }

  const verifyToken = getUrlParam('verify');
  const resetToken = getUrlParam('reset');

  if (verifyToken) {
    clearUrlParams();
    try {
      await apiPost('/api/auth/verify-email', { token: verifyToken });
      showToast('E-mail ověřen! Můžeš se přihlásit.');
      state.authView = 'login';
    } catch (err) { showToast(err.message); }
  } else if (resetToken) {
    clearUrlParams();
    state.overlay = { type: 'reset-password', token: resetToken };
    renderApp();
  }
}

bootstrap();
