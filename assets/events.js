// ============================================================
// GLOBÁLNE EVENT DELEGOVANIE
// ============================================================

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case 'set-tab':
      switchTab(el.dataset.tab);
      break;

    case 'open-lightbox': {
      e.preventDefault();
      const img = el.dataset.img;
      const caption = el.dataset.caption;
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

    case 'like-collection':
      likeCollection(el.dataset.id, el);
      break;

    case 'toggle-comments':
      toggleSocialComments(el.dataset.id, el.dataset.feed);
      break;
    case 'report-post':
      reportPost(el.dataset.id);
      break;

    case 'set-services-tab':
      setServicesTab(el.dataset.servicesTab);
      break;

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
    case 'topup':
      handleTopup(parseInt(el.dataset.amount, 10));
      break;
    case 'select-business':
      selectBusiness(el.dataset.id);
      break;
    case 'trigger-file-input':
      document.getElementById('post-file-input')?.click();
      break;
    case 'verify-business':
      verifyBusiness(el.dataset.kind, el.dataset.id);
      break;
    case 'delete-reported-post':
      deleteReportedPost(el.dataset.postId, el.dataset.reportId);
      break;
  }
});

// Zatváranie detail modalu kliknutím mimo obsahu
document.addEventListener('click', (e) => {
  if (e.target.id === 'detail-modal') {
    e.target.classList.remove('is-open');
    document.body.style.overflow = '';
  }
});

// Zmena select/input filtrov (nie click, ale change)
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'filter-change') {
    onFilterChange(el.dataset.feed, el.dataset.field, el.value);
  } else if (action === 'region-select-change') {
    onRegionSelectChangeForDistrict(el);
  } else if (action === 'file-selected') {
    onFileSelected(el);
  }
});

// Vyhľadávacie polia — debounced, bez re-renderu na každý stlačený znak
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action="search-change"]');
  if (!el) return;
  onSearchChange(el.dataset.feed, el.value);
});

// Odosielanie formulárov
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-action]');
  if (!form) return;
  e.preventDefault();
  const action = form.dataset.action;

  if (action === 'submit-login') handleLoginSubmit(form);
  else if (action === 'submit-register') handleRegisterSubmit(form);
  else if (action === 'submit-business-post') handleBusinessPostSubmit(form);
  else if (action === 'submit-social-comment') {
    const id = form.dataset.id;
    const feed = form.dataset.feed;
    const input = form.querySelector(`[data-comment-input="${id}"]`);
    submitSocialComment(id, feed, input.value, input);
  }
});

// Klávesa Escape zatvára modály
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.getElementById('lightbox')?.classList.remove('is-open');
  document.getElementById('detail-modal')?.classList.remove('is-open');
  document.body.style.overflow = '';
});

// ============================================================
// ŠTART APLIKÁCIE
// ============================================================
async function bootstrap() {
  renderApp(); // okamžité prvé vykreslenie s fallback číselníkmi, nech appka nie je prázdna
  await loadMetaFromApi();
  renderApp();
  loadCollections();
  if (isLoggedIn()) loadWallet();
}

bootstrap();
