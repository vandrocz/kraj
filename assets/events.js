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
      const id = el.dataset.id;
      const source = el.dataset.source;
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

    // Profily
    case 'open-profile':
      if (el.dataset.id) openProfile(el.dataset.kind, el.dataset.id);
      break;
    case 'close-overlay': closeOverlay(); break;
    case 'open-settings': openSettings(); break;
    case 'open-post': openPostFromProfile(el.dataset.postId, el.dataset.kind, el.dataset.id); break;
    case 'toggle-follow': toggleFollow(el.dataset.kind === 'user' ? 'user' : el.dataset.kind, el.dataset.id); break;

    case 'edit-profile':
      state.overlay = { type: 'profile', kind: el.dataset.kind, id: el.dataset.id, edit: true, editKind: el.dataset.kind, editId: el.dataset.id };
      renderApp();
      break;
    case 'cancel-edit':
      state.overlay = { type: 'profile', kind: el.dataset.kind, id: el.dataset.id };
      renderApp();
      break;
    case 'upload-avatar':
      uploadProfileImage(el.dataset.target, el.dataset.targetId, el.dataset.field);
      break;

    // Auth / account
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
  }
});

document.addEventListener('click', (e) => {
  if (e.target.id === 'detail-modal') { e.target.classList.remove('is-open'); document.body.style.overflow = ''; }
});

// Carousel: aktualizácia bodiek pri scrollovaní
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
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action="search-change"]');
  if (!el) return;
  onSearchChange(el.dataset.feed, el.value);
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
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.getElementById('lightbox')?.classList.remove('is-open');
  document.getElementById('detail-modal')?.classList.remove('is-open');
  document.body.style.overflow = '';
});

// ============================================================
// BOOTSTRAP
// ============================================================
async function bootstrap() {
  renderApp();
  await loadMetaFromApi();
  renderApp();
  loadCollections();
  if (isLoggedIn()) loadWallet();
}

bootstrap();
