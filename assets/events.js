// ============================================================
// GLOBÁLNE EVENT DELEGOVANIE
// ============================================================

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'set-tab': switchTab(el.dataset.tab); break;

    // Mapa na mobile — šípka späť na predchádzajúcu kartu
    case 'toggle-map-nav': {
      const isMobile = window.innerWidth < 720;
      if (isMobile) {
        const prev = localStorage.getItem('naskraj_prev_tab') || 'organizations';
        switchTab(prev);
      } else {
        state._mapNavCollapsed = !state._mapNavCollapsed;
        renderApp();
      }
      break;
    }

    case 'toggle-post-form': {
      accountFormState._postFormOpen = !accountFormState._postFormOpen;
      accountFormState.postFiles = [];
      renderApp();
      setTimeout(() => {
        document.getElementById('inline-post-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      break;
    }

    case 'open-notification': openNotification(el.dataset.notifId); break;
    case 'open-add-business': openAddBusinessModal(); break;
    case 'open-story-author':
    openStoryAuthor(el.dataset.authorId, el.dataset.authorKind);
    break;

    // ---------------------------------------------------------
    // STORIES
    // ---------------------------------------------------------
    case 'open-create-story': {
      const bizId = el.dataset.businessId || null;
      const bizName = el.dataset.businessName || null;
      openCreateStory(bizId, bizName);
      break;
    }
    case 'story-type':
      state.overlay.storyType = el.dataset.type;
      state.overlay.files = [];
      state.overlay.previews = [];
      renderApp();
      break;
    case 'remove-story-file':
      removeStoryFile(parseInt(el.dataset.index, 10));
      break;
    case 'story-like':
      storyLike(el.dataset.id);
      break;
    case 'open-story-viewer':
      openStoryViewer(el.dataset.groupKey);
      break;
    case 'close-story-viewer':
      if (typeof stopStoryAutoAdvance === 'function') stopStoryAutoAdvance();
      closeStoryViewer();
      break;
    case 'story-next':
      if (typeof stopStoryAutoAdvance === 'function') stopStoryAutoAdvance();
      storyNext();
      break;
    case 'story-prev':
      if (typeof stopStoryAutoAdvance === 'function') stopStoryAutoAdvance();
      storyPrev();
      break;
    case 'story-reply-open':
      // Stará funkcia, ponechaná pre spätnú kompatibilitu (ak existuje)
      if (typeof storyReplyOpen === 'function') storyReplyOpen();
      break;
    case 'story-reply-cancel':
      if (typeof storyReplyCancel === 'function') storyReplyCancel();
      break;
    case 'story-reply-send':
      if (typeof storyReplySend === 'function') storyReplySend();
      break;
    case 'trigger-story-file':
      document.getElementById('story-file-input')?.click();
      break;

    // ---------------------------------------------------------
    // LIGHTBOX
    // ---------------------------------------------------------
    case 'open-lightbox': {
      e.preventDefault();
      const postId = el.dataset.postId;
      const index = parseInt(el.dataset.index || '0', 10);
      const caption = el.dataset.caption || '';
      const img = el.dataset.img;

      let images = [img].filter(Boolean);
      let post = null;

      if (postId) {
        // 1) Skús socialFeeds
        for (const key of Object.keys(state.socialFeeds)) {
          const p = state.socialFeeds[key].items.find((x) => x.id === postId);
          if (p) { post = p; post.__feedKey = key === 'organization' ? 'organization' : key; break; }
        }
        // 2) Skús profiles
        if (!post) {
          for (const k of Object.keys(state.profiles)) {
            const d = state.profiles[k];
            if (d?.posts) {
              const p = d.posts.find((x) => x.id === postId);
              if (p) { post = p; post.__feedKey = d.feedKey || null; break; }
            }
          }
        }
        if (post?.media?.length) images = post.media;
        if (images.length === 0) return;
        apiPost(`/api/feed/${postId}/view`, {}).catch(() => {});
      }
      if (images.length === 0) return;
      openLightbox(images, index, caption, post);
      break;
    }
    case 'close-lightbox': closeLightbox(); break;
    case 'lightbox-prev': lightboxPrev(); break;
    case 'lightbox-next': lightboxNext(); break;
    case 'toggle-lightbox-expand':
      if (typeof cycleLightboxPanelState === 'function') cycleLightboxPanelState();
      break;
    case 'lightbox-cycle-panel':
      if (typeof cycleLightboxPanelState === 'function') cycleLightboxPanelState();
      break;

    // ---------------------------------------------------------
    // POSTY
    // ---------------------------------------------------------
    case 'toggle-post-like':
      togglePostLike(el.dataset.id, el.dataset.feed, el);
      break;
    case 'toggle-bookmark':
      toggleBookmark(el.dataset.id, el);
      break;
    case 'share-post':
      sharePost(el.dataset.id, el.dataset.text);
      break;
    case 'report-post':
      reportPost(el.dataset.id);
      break;
    case 'edit-post':
      openEditPost(el.dataset.id, el.dataset.feed);
      break;
    case 'delete-post':
      deletePost(el.dataset.id, el.dataset.feed);
      break;
    case 'delete-comment':
      deleteComment(el.dataset.id, el.dataset.feed, el.dataset.postId);
      break;

    // ---------------------------------------------------------
    // PROFIL
    // ---------------------------------------------------------
    case 'open-profile':
      if (el.dataset.id) openProfile(el.dataset.kind, el.dataset.id);
      break;
    case 'close-overlay':
      closeOverlay();
      break;
    case 'clear-overlay':
      clearOverlay();
      break;
    case 'open-settings':
      openSettings();
      break;
    case 'open-security':
      openSecurity();
      break;
    case 'open-notifications':
      openNotifications();
      break;
    case 'open-search':
      openSearch();
      break;
    case 'open-blocks':
      openBlocks();
      break;
    case 'open-followers':
      openFollowers(el.dataset.kind === 'user' ? 'user' : el.dataset.kind, el.dataset.id);
      break;
    case 'open-following':
      openFollowing();
      break;
    case 'open-forgot':
      openForgotPassword();
      break;
    case 'open-login-logs':
      openLoginLogs();
      break;
    case 'open-threads':
      openThreads();
      break;
    case 'open-thread':
      openThreadById(el.dataset.id);
      break;
    case 'open-groups':
      openGroups();
      break;
    case 'open-group':
      openGroupDetail(el.dataset.id);
      break;
    case 'open-create-group':
      handleCreateGroup();
      break;
    case 'join-group':
      joinGroup(el.dataset.id);
      break;
    case 'leave-group':
      leaveGroup(el.dataset.id);
      break;
    case 'open-post':
      openPostFromProfile(el.dataset.postId, el.dataset.kind, el.dataset.id);
      break;
    case 'open-post-bookmark': {
      const b = (state._bookmarks || []).find((x) => x.id === el.dataset.id);
      if (b?.image_url) openLightbox([b.image_url], 0, b.text_content || '');
      break;
    }
    case 'toggle-follow':
      toggleFollow(el.dataset.kind === 'user' ? 'user' : el.dataset.kind, el.dataset.id);
      break;
    case 'read-all-notifications':
      markAllNotificationsRead();
      break;
    case 'block-user':
      blockUser(el.dataset.id);
      break;
    case 'unblock-user':
      unblockUser(el.dataset.id);
      break;
    case 'resend-verification':
      resendVerification();
      break;
    case 'delete-account':
      promptDeleteAccount();
      break;
    case 'export-data':
      exportMyData();
      break;
    case 'open-bookmarks':
      openBookmarks();
      break;

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
      pushHistoryState('overlay');
      renderApp();
      break;
    case 'upload-avatar':
      uploadProfileImage(el.dataset.target, el.dataset.targetId, el.dataset.field);
      break;

    // ---------------------------------------------------------
    // AUTH
    // ---------------------------------------------------------
    case 'set-auth-view':
      state.authView = el.dataset.view;
      accountFormState.formError = '';
      renderApp();
      break;
    case 'set-register-role':
      accountFormState.registerRole = el.dataset.role;
      renderApp();
      break;
    case 'set-business-kind':
      accountFormState.registerBusinessKind = el.dataset.kind;
      renderApp();
      break;
    case 'logout':
      handleLogout();
      break;

    // ---------------------------------------------------------
    // BUSINESS DASHBOARD
    // ---------------------------------------------------------
    case 'select-business':
      selectBusiness(el.dataset.id);
      break;
    case 'trigger-file-input':
      document.getElementById('post-file-input')?.click();
      break;
    case 'remove-post-file':
      removePostFile(el.dataset.name);
      break;
    case 'verify-business':
      verifyBusiness(el.dataset.kind, el.dataset.id);
      break;
    case 'delete-reported-post':
      deleteReportedPost(el.dataset.postId, el.dataset.reportId);
      break;
    case 'start-2fa-setup':
      start2FASetup();
      break;
    case 'finish-2fa-setup':
      finish2FASetup();
      break;
    case 'dm-user':
      openThreadWith(el.dataset.id);
      break;
    case 'dm-business-owner':
      (async () => {
        try {
          const data = await apiGet(`/api/profile/${el.dataset.kind}/${el.dataset.id}`);
          const ownerId = data.profile.user_id;
          if (ownerId) openThreadWith(ownerId);
        } catch { showToast('Nepodařilo se otevřít konverzaci.'); }
      })();
      break;

    // ---------------------------------------------------------
    // RICH EDITOR
    // ---------------------------------------------------------
    case 'rich-cmd':
      richCmd(el.dataset.cmd);
      break;
    case 'rich-link':
      richLink();
      break;
    case 'rich-emoji':
      richEmoji();
      break;
    case 'close-emoji':
      closeEmojiPicker();
      break;
    case 'insert-emoji':
      insertEmoji(el.dataset.emoji);
      break;
    case 'insert-mention':
      insertMention(el.dataset.name);
      break;
    case 'attach-geo':
      (async () => {
        const loc = await attachLocationToPost();
        if (loc) {
          const f = document.querySelector('[data-action="submit-business-post"]');
          if (f) {
            f.dataset.geoLat = loc.lat;
            f.dataset.geoLng = loc.lng;
            f.dataset.geoPlace = loc.place;
          }
          const btn = document.querySelector('[data-geo-label]');
          if (btn) btn.textContent = `📍 ${loc.place}`;
        }
      })();
      break;

    // ---------------------------------------------------------
    // EVENTY
    // ---------------------------------------------------------
    case 'open-event':
      openEventDetail(el.dataset.id);
      break;
    case 'open-event-create':
      openCreateEvent();
      break;
    case 'delete-event':
      deleteEvent(el.dataset.id);
      break;
    case 'share-event':
      shareEvent(el.dataset.id);
      break;
    case 'add-to-calendar':
      addEventToCalendar(el.dataset.id);
      break;
    case 'open-event-gallery':
      openEventGallery(el.dataset.eventId, parseInt(el.dataset.index || '0', 10));
      break;
    case 'trigger-event-file':
      document.getElementById('event-file-input')?.click();
      break;
    case 'remove-event-file':
      removeEventFile(el.dataset.name);
      break;

    // ---------------------------------------------------------
    // PROFIL TABS & STATS
    // ---------------------------------------------------------
    case 'biz-profile-tab':
      switchBizProfileTab(el.dataset.tab);
      break;
    case 'open-profile-stats':
      openProfileStats(el.dataset.kind, el.dataset.id);
      break;
    case 'stats-period':
      if (state._profileStatsView) {
        state._profileStatsView.period = el.dataset.period;
        renderApp();
      }
      break;

    // ---------------------------------------------------------
    // NEARBY
    // ---------------------------------------------------------
    case 'open-nearby':
      openNearby();
      break;
    case 'nearby-refresh':
      loadNearby();
      break;

    // ---------------------------------------------------------
    // WISHLIST
    // ---------------------------------------------------------
    case 'open-wishlist':
      openWishlist();
      break;
    case 'toggle-wishlist':
      toggleWishlist(el.dataset.kind, el.dataset.id, el);
      break;

    // ---------------------------------------------------------
    // BADGES & CHECKINS
    // ---------------------------------------------------------
    case 'open-badges':
      openBadges();
      break;
    case 'open-user-checkins':
      openUserCheckins(el.dataset.id);
      break;
    case 'open-business-checkins':
      openBusinessCheckins(el.dataset.kind, el.dataset.id);
      break;
    case 'open-create-checkin':
      openCheckinCreate(el.dataset.kind, el.dataset.id, el.dataset.name);
      break;

    // ---------------------------------------------------------
    // REVIEWS
    // ---------------------------------------------------------
    case 'open-create-review':
      openCreateReview(el.dataset.kind, el.dataset.id);
      break;
    case 'set-review-rating':
      setReviewRating(parseInt(el.dataset.value, 10));
      break;

    // ---------------------------------------------------------
    // ONBOARDING
    // ---------------------------------------------------------
    case 'onboarding-next':
      onboardingNext();
      break;
    case 'onboarding-skip':
      onboardingSkip();
      break;
    case 'onboarding-toggle-biz':
      onboardingToggleBiz(el.dataset.kind, el.dataset.id, el.dataset.name);
      break;
    case 'onboarding-avatar-pick':
      onboardingAvatarPick();
      break;
    case 'onboarding-finish':
      finishOnboarding(false);
      break;

    // ---------------------------------------------------------
    // VERIFICATION
    // ---------------------------------------------------------
    case 'open-verification-request':
      openVerificationRequest(el.dataset.kind, el.dataset.id, el.dataset.name);
      break;
    case 'trigger-verif-doc':
      document.getElementById('verif-doc-input')?.click();
      break;
    case 'approve-verification':
      approveVerification(el.dataset.id);
      break;
    case 'reject-verification':
      rejectVerification(el.dataset.id);
      break;

    // ---------------------------------------------------------
    // ADMIN
    // ---------------------------------------------------------
    case 'admin-tab':
      state._adminTab = el.dataset.tab;
      if (el.dataset.tab === 'users' && state.adminUsers === null) loadAdminUsers();
      renderApp();
      break;
    case 'admin-suspend-user':
      suspendUser(el.dataset.id);
      break;
    case 'admin-unsuspend-user':
      unsuspendUser(el.dataset.id);
      break;
    case 'admin-change-role':
      changeUserRole(el.dataset.id);
      break;
    case 'admin-user-detail':
      openUserDetail(el.dataset.id);
      break;
    case 'admin-force-verify-email':
      (async () => {
        try {
          await apiPost(`/api/admin/users/${el.dataset.id}/force-verify-email`, {});
          showToast('E-mail ověřen.');
        } catch (err) { showToast(err.message); }
      })();
      break;
    case 'resolve-user-report':
      (async () => {
        try {
          await apiPost(`/api/admin/user-reports/${el.dataset.id}/resolve`, {});
          showToast('Vyřešeno.');
          state.adminUserReports = null;
          renderApp();
        } catch (err) { showToast(err.message); }
      })();
      break;
    case 'open-broadcast-push':
      openBroadcastPush();
      break;
    case 'admin-backfill-handles':
      adminBackfillHandles();
      break;
    case 'admin-seed-test':
      adminSeedTest();
      break;
    case 'admin-cleanup-test':
      adminCleanupTest();
      break;

    // ---------------------------------------------------------
    // PUSH
    // ---------------------------------------------------------
    case 'push-test':
      testPush();
      break;

    // ---------------------------------------------------------
    // COOKIES
    // ---------------------------------------------------------
    case 'accept-cookies':
      acceptCookies();
      break;
    case 'reject-cookies':
      rejectCookies();
      break;
    case 'open-cookie-settings':
      openCookieSettings();
      break;
    case 'save-cookie-settings':
      saveCookieSettings();
      break;

    // ---------------------------------------------------------
    // HASHTAGS
    // ---------------------------------------------------------
    case 'open-hashtag':
      openHashtag(el.dataset.tag);
      break;

    // ---------------------------------------------------------
    // MODAL
    // ---------------------------------------------------------
    case 'close-modal-scrim':
      if (e.target.classList.contains('modal-scrim') || e.target.closest('.modal-scrim') === e.target) {
        closeModal();
      }
      break;
    case 'close-modal':
      closeModal();
      break;
  }
});

// Detail modal (starý) — zatvorenie klikom mimo
document.addEventListener('click', (e) => {
  if (e.target.id === 'detail-modal') {
    e.target.classList.remove('is-open');
    document.body.style.overflow = '';
  }
});

// Carousel — aktívna bodka podľa scrollu
document.addEventListener('scroll', (e) => {
  const track = e.target.closest?.('[data-carousel-track]');
  if (!track) return;
  const carousel = track.closest('[data-post-carousel]');
  if (!carousel) return;
  const idx = Math.round(track.scrollLeft / track.clientWidth);
  carousel.querySelectorAll('.post-carousel-dot').forEach((d, i) => {
    d.classList.toggle('is-active', i === idx);
  });
}, true);

// ============================================================
// CHANGE HANDLERS
// ============================================================
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
  else if (a === 'event-files-selected') onEventFilesSelected(el);
  else if (a === 'file-selected') onFileSelected(el);
  else if (a === 'admin-user-role-filter') {
    state._adminUserRole = el.value;
    state.adminUsers = null;
    loadAdminUsers();
  }
  else if (a === 'admin-user-status-filter') {
    state._adminUserStatus = el.value;
    state.adminUsers = null;
    loadAdminUsers();
  }
  else if (a === 'cookie-setting') toggleCookieSetting(el.dataset.key, el.checked);
  else if (a === 'setting-toggle') toggleSetting(el.dataset.key, el.checked);
  else if (a === 'story-file-selected') onStoryFileSelected(el);
  else if (a === 'event-filter') onEventFilterChange(el.dataset.field, el.value);
  else if (a === 'event-business-select') {
    state.overlay.businessId = el.value;
    renderApp();
  }
  else if (a === 'nearby-radius') {
    state.nearby.radius = parseInt(el.value, 10);
    loadNearby();
  }
  else if (a === 'nearby-kind') {
    state.nearby.kind = el.value;
    loadNearby();
  }
  else if (a === 'onboarding-avatar-change') onboardingAvatarChange(el);
  else if (a === 'verif-doc-selected') onVerifDocSelected(el);
  else if (a === 'push-toggle') handlePushToggle(el.checked);
  else if (a === 'add-business-kind-change') updateAddBusinessTypeOptions(el.value);
  else if (a === 'stats-metric') {
    if (state._profileStatsView) {
      state._profileStatsView.metric = el.value;
      renderApp();
    }
  }
  else if (a === 'lang-select') {
    if (typeof setLanguage === 'function') setLanguage(el.value);
  }
  else if (a === 'district-change') {
    const form = el.closest('form');
    const citySelect = form.querySelector('select[name="city"]');
    const district = el.value;
    if (!citySelect) return;
    if (!district) {
      citySelect.innerHTML = '<option value="">Nejprve vyberte okres</option>';
      return;
    }
    citySelect.innerHTML = '<option value="">Načítám obce…</option>';
    loadCitiesForDistrict(district).then((cities) => {
      if (cities.length === 0) {
        citySelect.innerHTML = '<option value="">(žádné obce)</option>';
      } else {
        citySelect.innerHTML = '<option value="">Vyberte obec…</option>' +
          cities.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
      }
    });
  }
});

// ============================================================
// INPUT HANDLERS
// ============================================================
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  if (el.dataset.action === 'search-change') {
    onSearchChange(el.dataset.feed, el.value);
    return;
  }
  if (el.dataset.action === 'search-global') {
    onGlobalSearchInput(el.value);
    return;
  }
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
  if (el.dataset.action === 'admin-user-search') {
    state._adminUserQuery = el.value;
    clearTimeout(window._adminUserSearchTimer);
    window._adminUserSearchTimer = setTimeout(() => {
      state.adminUsers = null;
      loadAdminUsers();
    }, 400);
    return;
  }
});

// ============================================================
// SUBMIT HANDLERS
// ============================================================
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-action]');
  if (!form) return;
  e.preventDefault();
  const a = form.dataset.action;

  if (a === 'submit-login') handleLoginSubmit(form);
  else if (a === 'submit-modal') {
    const m = state._modal;
    if (!m || !m.onSubmit) return;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    m.onSubmit(data);
    return;
  }
  else if (a === 'submit-lightbox-comment') {
    const id = form.dataset.id;
    const feed = form.dataset.feed;
    const input = form.querySelector('[data-lightbox-comment-input]');
    if (!input) return;
    const text = input.value;
    input.value = '';
    submitLightboxComment(id, feed, text);
    return;
  }
  else if (a === 'submit-register') handleRegisterSubmit(form);
  else if (a === 'submit-business-post') handleBusinessPostSubmit(form);
  else if (a === 'submit-edit-profile') handleEditProfileSubmit(form);
  else if (a === 'submit-create-event') handleCreateEventSubmit(form);
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

// ============================================================
// KEYBOARD
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.lightbox) { closeLightbox(); return; }
    if (state.overlay?.type === 'story-viewer') {
      if (typeof stopStoryAutoAdvance === 'function') stopStoryAutoAdvance();
      closeOverlay();
      return;
    }
    if (state._modal) { closeModal(); return; }
    document.getElementById('detail-modal')?.classList.remove('is-open');
    document.body.style.overflow = '';
    if (state.overlay) closeOverlay();
  }

  if (state.overlay?.type === 'story-viewer') {
    if (e.key === 'ArrowRight') {
      if (typeof stopStoryAutoAdvance === 'function') stopStoryAutoAdvance();
      storyNext();
    } else if (e.key === 'ArrowLeft') {
      if (typeof stopStoryAutoAdvance === 'function') stopStoryAutoAdvance();
      storyPrev();
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

  const urlEvent = getUrlParam('event');
  const urlPost = getUrlParam('post');
  const urlProfile = getUrlParam('profile');
  const urlHashtag = getUrlParam('hashtag');
  const urlThread = getUrlParam('thread');

  if (urlEvent) {
    clearUrlParams();
    setTimeout(() => openEventDetail(urlEvent), 100);
  } else if (urlPost) {
    clearUrlParams();
    setTimeout(async () => {
      try {
        const data = await apiGet(`/api/feed/post-by-id/${encodeURIComponent(urlPost)}`);
        if (data.post) {
          const post = data.post;
          try {
            const c = await apiGet(`/api/feed/${post.id}/comments`);
            post.__comments = c.comments || [];
            post.comment_count = c.total || 0;
          } catch {}
          if (post.media && post.media.length > 0) {
            openLightbox(post.media, 0, post.text || '', post);
          }
        }
      } catch (err) {
        showToast('Příspěvek se nepodařilo načíst.');
      }
    }, 200);
  } else if (urlProfile) {
    clearUrlParams();
    const [kind, id] = urlProfile.split(':');
    if (kind && id) setTimeout(() => openProfile(kind, id), 100);
  } else if (urlHashtag) {
    clearUrlParams();
    setTimeout(() => openHashtag(urlHashtag), 100);
  } else if (urlThread) {
    clearUrlParams();
    setTimeout(() => openThreadById(urlThread), 100);
  }
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
    if (typeof maybeRequestPushPermission === 'function') maybeRequestPushPermission();
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
