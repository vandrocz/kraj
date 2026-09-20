// ============================================================
// GLOBÁLNE EVENT DELEGOVANIE
// ============================================================

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'set-tab': switchTab(el.dataset.tab); break;

    case 'open-lightbox': {
      e.preventDefault();
      const postId = el.dataset.postId;
      const index = parseInt(el.dataset.index || '0', 10);
      const caption = el.dataset.caption || '';
      const img = el.dataset.img;

      let images = [img].filter(Boolean);
      if (postId) {
        for (const key of Object.keys(state.socialFeeds)) {
          const p = state.socialFeeds[key].items.find((x) => x.id === postId);
          if (p && p.media?.length) { images = p.media; break; }
        }
        if (images.length <= 1) {
          for (const k of Object.keys(state.profiles)) {
            const d = state.profiles[k];
            if (d?.posts) {
              const p = d.posts.find((x) => x.id === postId);
              if (p && p.media?.length) { images = p.media; break; }
            }
          }
        }
        if (images.length === 0) return;
        apiPost(`/api/feed/${postId}/view`, {}).catch(() => {});
      }
      if (images.length === 0) return;
      openLightbox(images, index, caption);
      break;
    }
    case 'close-lightbox': closeLightbox(); break;
    case 'lightbox-prev': lightboxPrev(); break;
    case 'lightbox-next': lightboxNext(); break;

    case 'toggle-comments': toggleSocialComments(el.dataset.id, el.dataset.feed); break;
    case 'toggle-post-like': togglePostLike(el.dataset.id, el.dataset.feed, el); break;
    case 'toggle-bookmark': toggleBookmark(el.dataset.id, el); break;
    case 'share-post': sharePost(el.dataset.id, el.dataset.text); break;
    case 'report-post': reportPost(el.dataset.id); break;
    case 'reply-comment': toggleReplyForm(el.dataset.id); break;
    case 'edit-post': openEditPost(el.dataset.id, el.dataset.feed); break;

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
    case 'open-post-bookmark': {
      const b = (state._bookmarks || []).find((x) => x.id === el.dataset.id);
      if (b?.image_url) openLightbox([b.image_url], 0, b.text_content || '');
      break;
    }
    case 'toggle-follow': toggleFollow(el.dataset.kind === 'user' ? 'user' : el.dataset.kind, el.dataset.id); break;
    case 'read-all-notifications': markAllNotificationsRead(); break;
    case 'block-user': blockUser(el.dataset.id); break;
    case 'unblock-user': unblockUser(el.dataset.id); break;
    case 'delete-post': deletePost(el.dataset.id, el.dataset.feed); break;
    case 'delete-comment': deleteComment(el.dataset.id, el.dataset.feed, el.dataset.postId); break;
    case 'resend-verification': resendVerification(); break;
    case 'delete-account': promptDeleteAccount(); break;
    case 'export-data': exportMyData(); break;
    case 'open-bookmarks': openBookmarks(); break;

    case 'report-user': {
      const reason = prompt('Proč tohoto uživatele nahlašuješ? (nepovinné)');
      if (reason === null) break;
      (async () => {
        try {
          await apiPost(`/api/profile/report/${el.dataset.id}`, { reason: reason || null });
          showToast('Nahlášení odesláno.');
        } catch (err) { showToast(err.message); }
      })();
      break;
    }

    case 'edit-profile':
      state.overlay = { type: 'profile', kind: el.dataset.kind, id: el.dataset.id, edit: true, editKind: el.dataset.kind, editId: el.dataset.id };
      renderApp();
      break;
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
        } catch { showToast('Nepodařilo se otevřít konverzaci.'); }
      })();
      break;
    case 'open-story-viewer': openStoryViewer(el.dataset.groupKey); break;
    case 'open-create-story': openCreateStory(); break;
    case 'close-story-viewer': closeStoryViewer(); break;
    case 'story-next': storyNext(); break;
    case 'story-prev': storyPrev(); break;
    case 'story-reply-open': storyReplyOpen(); break;
    case 'story-reply-cancel': storyReplyCancel(); break;
    case 'story-reply-send': storyReplySend(); break;
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

    case 'open-event': openEventDetail(el.dataset.id); break;
    case 'open-event-create': openCreateEvent(); break;
    case 'delete-event': deleteEvent(el.dataset.id); break;
    case 'trigger-event-file': document.getElementById('event-file-input')?.click(); break;
    case 'event-file-selected': onEventFileSelected(el); break;

    case 'biz-profile-tab': switchBizProfileTab(el.dataset.tab); break;
    case 'open-profile-stats': openProfileStats(el.dataset.kind, el.dataset.id); break;

    // Nearby
    case 'open-nearby': openNearby(); break;
    case 'nearby-refresh': loadNearby(); break;

    // Wishlist
    case 'open-wishlist': openWishlist(); break;
    case 'toggle-wishlist': toggleWishlist(el.dataset.kind, el.dataset.id, el); break;

    // Badges
    case 'open-badges': openBadges(); break;
    case 'open-user-checkins': openUserCheckins(el.dataset.id); break;
    case 'open-business-checkins': openBusinessCheckins(el.dataset.kind, el.dataset.id); break;

    // Checkin
    case 'open-create-checkin': openCheckinCreate(el.dataset.kind, el.dataset.id, el.dataset.name); break;

    // Reviews
    case 'open-create-review': openCreateReview(el.dataset.kind, el.dataset.id); break;
    case 'set-review-rating': setReviewRating(parseInt(el.dataset.value, 10)); break;

    // Onboarding
    case 'onboarding-next': onboardingNext(); break;
    case 'onboarding-skip': onboardingSkip(); break;
    case 'onboarding-toggle-biz': onboardingToggleBiz(el.dataset.kind, el.dataset.id, el.dataset.name); break;
    case 'onboarding-avatar-pick': onboardingAvatarPick(); break;

    // Verification (business)
    case 'open-verification-request': openVerificationRequest(el.dataset.kind, el.dataset.id, el.dataset.name); break;
    case 'trigger-verif-doc': document.getElementById('verif-doc-input')?.click(); break;

    // Admin — verifications
    case 'approve-verification': approveVerification(el.dataset.id); break;
    case 'reject-verification': rejectVerification(el.dataset.id); break;
    case 'admin-backfill-handles': adminBackfillHandles(); break;
    case 'admin-seed-test': adminSeedTest(); break;
    case 'admin-cleanup-test': adminCleanupTest(); break;

    // Push
    case 'push-test': testPush(); break;

    // Cookies
    case 'accept-cookies': acceptCookies(); break;
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
  else if (a === 'event-filter') onEventFilterChange(el.dataset.field, el.value);
  else if (a === 'event-business-select') {
    state.overlay.businessId = el.value;
    renderApp();
  }
  else if (a === 'nearby-radius') { state.nearby.radius = parseInt(el.value, 10); loadNearby(); }
  else if (a === 'nearby-kind') { state.nearby.kind = el.value; loadNearby(); }
  else if (a === 'onboarding-avatar-change') onboardingAvatarChange(el);
  else if (a === 'verif-doc-selected') onVerifDocSelected(el);
  else if (a === 'push-toggle') handlePushToggle(el.checked);
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'search-change') { onSearchChange(el.dataset.feed, el.value); return; }
  if (el.dataset.action === 'search-global') { onGlobalSearchInput(el.value); return; }
  if (el.dataset.action === 'event-search') {
    state.events.search = el.value;
    state.events.next_cursor = null;
    clearTimeout(window._eventSearchTimer);
    window._eventSearchTimer = setTimeout(() => loadEvents(), 400);
    return;
  }
  if (el.dataset.action === 'onboarding-bio') {
    state.overlay.bio = el.value;
    return;
  }
  if (el.dataset.action === 'story-reply-input') {
    state.overlay.replyText = el.value;
    return;
  }
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
  else if (a === 'submit-create-event') handleCreateEventSubmit(form);
  else if (a === 'submit-social-comment') {
    const id = form.dataset.id, feed = form.dataset.feed;
    const input = form.querySelector(`[data-comment-input="${id}"]`);
    submitSocialComment(id, feed, input.value, input);
  }
  else if (a === 'submit-reply') {
    const parentId = form.dataset.id;
    const postId = form.dataset.postId;
    const feed = form.dataset.feed;
    const input = form.querySelector(`[data-reply-input="${parentId}"]`);
    submitReply(parentId, postId, feed, input.value, input);
  }
  else if (a === 'submit-forgot') handleForgotSubmit(form);
  else if (a === 'submit-reset') handleResetSubmit(form);
  else if (a === 'submit-2fa-login') handleTwoFALogin(form);
  else if (a === 'submit-enable-2fa') submitEnable2FA(form);
  else if (a === 'submit-disable-2fa') submitDisable2FA(form);
  else if (a === 'submit-thread-message') handleSendThreadMessage(form);
  else if (a === 'submit-group-post') handleGroupPostSubmit(form);
  else if (a === 'submit-create-story') handleCreateStorySubmit(form);
  else if (a === 'submit-checkin') handleCheckinSubmit(form);
  else if (a === 'submit-review') handleReviewSubmit(form);
  else if (a === 'submit-edit-post') handleEditPostSubmit(form);
  else if (a === 'submit-verification-request') handleVerificationSubmit(form);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.lightbox) { closeLightbox(); return; }
    if (state.overlay?.type === 'story-viewer' && state.overlay.replyOpen) { storyReplyCancel(); return; }
    document.getElementById('detail-modal')?.classList.remove('is-open');
    document.body.style.overflow = '';
    if (state.overlay) closeOverlay();
  }
  if (e.key === 'Enter' && state.overlay?.type === 'story-viewer' && state.overlay.replyOpen) {
    const input = document.querySelector('[data-story-reply-input]');
    if (document.activeElement === input) {
      e.preventDefault();
      storyReplySend();
    }
  }
});

// ============================================================
// BOOTSTRAP
// ============================================================
async function bootstrap() {
  state.tab = restoreTab();
  getFeedTitle(state.tab);

  renderApp();
  await loadMetaFromApi();
  renderApp();

  if (state.tab === 'organizations') loadSocialFeed('organization');
  else if (state.tab === 'accommodation') loadSocialFeed('accommodation');
  else if (state.tab === 'gastro') loadSocialFeed('gastro');
  else if (state.tab === 'events') loadEvents();

  if (isLoggedIn()) {
    loadNotifications();
    loadStoriesFeed();
    if (typeof maybeSubscribePush === 'function') maybeSubscribePush();
    if (typeof maybeStartOnboarding === 'function') maybeStartOnboarding(state.user);
  }

  const verifyToken = getUrlParam('verify');
  const resetToken = getUrlParam('reset');

  if (verifyToken) {
    clearUrlParams();
    try {
      await apiPost('/api/auth/verify-email', { token: verifyToken });
      showToast('E-mail ověřen!');
      state.authView = 'login';
    } catch (err) { showToast(err.message); }
  } else if (resetToken) {
    clearUrlParams();
    state.overlay = { type: 'reset-password', token: resetToken };
    renderApp();
  }
}

bootstrap();
