// ============================================================
// SEKCE 5: MŮJ PROFIL (zlúčené s "Můj účet" podľa B1)
// ============================================================

const accountFormState = {
  registerRole: 'user',
  registerBusinessKind: 'accommodation',
  postTargetBusiness: null,
  postFiles: [],
  formError: '',
  formBusy: false,
};

// ------------------------------------------------------------------
// B1: Toto je teraz jediná "Profil" karta. Hlavička má iba 2 tlačidlá:
// zvonček (s badge) + nastavenia.
// ------------------------------------------------------------------
function renderAccountPage() {
  if (!isLoggedIn()) {
    const html = `
      <div class="page-scroll">
        ${renderHeader('Můj profil', `
          <button class="header-icon-btn" data-action="open-settings" aria-label="Nastavení">${icon('settings', { size: 19 })}</button>
        `)}
        ${renderAuthCard()}
      </div>`;
    setTimeout(() => {
      const el = document.getElementById('google-signin-container');
      if (el && el.children.length === 0) renderGoogleButton(el, handleGoogleCredential);
    }, 80);
    return html;
  }

  const headerActions = `
    <button class="header-icon-btn" data-action="open-notifications" style="position:relative" aria-label="Notifikace">
      ${icon('bell', { size: 19 })}
      ${state.unreadNotifications > 0 ? `<span class="nav-badge">${state.unreadNotifications > 9 ? '9+' : state.unreadNotifications}</span>` : ''}
    </button>
    <button class="header-icon-btn" data-action="open-settings" aria-label="Nastavení">${icon('settings', { size: 19 })}</button>
  `;

  return `
    <div class="page-scroll">
      ${renderHeader('Můj profil', headerActions)}
      ${renderVerifyBanner()}
      ${renderAccountHeaderCard()}
      ${renderRoleSpecificContent()}
    </div>`;
}

function renderVerifyBanner() {
  if (!isLoggedIn()) return '';
  if (state.user.email_verified) return '';
  return `
    <div class="verify-banner" data-action="resend-verification">
      <div class="verify-banner-icon">${icon('mail', { size: 22 })}</div>
      <div class="verify-banner-body">
        <p class="verify-banner-title">Ověř svůj e-mail</p>
        <p class="verify-banner-text">Poslali jsme odkaz na <strong>${escapeHtml(state.user.email)}</strong>. <span style="color:var(--c-primary-dark);font-weight:700">Poslat znovu →</span></p>
      </div>
    </div>`;
}

function renderAuthCard() {
  return `
    <div class="auth-card">
      <div class="auth-tabs">
        <button class="auth-tab ${state.authView === 'login' ? 'is-active' : ''}" data-action="set-auth-view" data-view="login">Přihlásit se</button>
        <button class="auth-tab ${state.authView === 'register' ? 'is-active' : ''}" data-action="set-auth-view" data-view="register">Registrace</button>
      </div>
      ${accountFormState.formError ? `<div class="form-error">${accountFormState.formError}</div>` : ''}
      <div id="google-signin-container" style="display:flex;justify-content:center;margin-bottom:18px;max-width:100%;overflow:hidden;"></div>
      <div class="auth-divider"><span>nebo</span></div>
      ${state.authView === 'login' ? renderLoginForm() : renderRegisterForm()}
      ${state.authView === 'login' ? `<p style="text-align:center;margin-top:14px;font-size:12.5px"><button type="button" data-action="open-forgot" style="color:var(--c-primary-dark);font-weight:600">Zapomněl jsi heslo?</button></p>` : ''}
    </div>`;
}

function renderLoginForm() {
  return `
    <form data-action="submit-login">
      <div class="form-field"><label class="form-label">E-mail</label><input class="form-input" type="email" name="email" required autocomplete="email" /></div>
      <div class="form-field"><label class="form-label">Heslo</label><input class="form-input" type="password" name="password" required autocomplete="current-password" /></div>
      <button class="form-submit-btn" type="submit">Přihlásit se</button>
    </form>`;
}

function renderRegisterForm() {
  const role = accountFormState.registerRole;
  const kind = accountFormState.registerBusinessKind;

  const roleFields = role === 'organization' ? `
    <div class="form-field"><label class="form-label">Název organizace</label><input class="form-input" name="orgName" required /></div>
    <div class="form-field"><label class="form-label">Druh</label>
      <select class="form-select" name="orgType" required>
        ${TYPES.organization.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
      </select></div>
    ${renderRegionDistrictCityFields('reg')}
    <div class="form-field"><label class="form-label">Popis</label><textarea class="form-textarea" name="description"></textarea></div>
  ` : role === 'hotelier' ? `
    <div class="form-role-grid" style="grid-template-columns:repeat(2,1fr)">
      <button type="button" class="form-role-btn ${kind === 'accommodation' ? 'is-selected' : ''}" data-action="set-business-kind" data-kind="accommodation">Ubytování</button>
      <button type="button" class="form-role-btn ${kind === 'gastro' ? 'is-selected' : ''}" data-action="set-business-kind" data-kind="gastro">Gastro</button>
    </div>
    <input type="hidden" name="businessKind" value="${kind}" />
    <div class="form-field"><label class="form-label">Název podniku</label><input class="form-input" name="businessName" required /></div>
    <div class="form-field"><label class="form-label">Typ</label>
      <select class="form-select" name="businessType" required>
        ${(kind === 'accommodation' ? TYPES.accommodation : TYPES.restaurant).map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
      </select></div>
    ${kind === 'gastro' ? `<div class="form-field"><label class="form-label">Kuchyně</label>
      <select class="form-select" name="cuisineType">${TYPES.cuisine.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}</select></div>`
      : `<div class="form-field"><label class="form-label">Kapacita</label><input class="form-input" type="number" name="capacity" min="1" /></div>`}
    ${renderRegionDistrictCityFields('reg')}
    <div class="form-field"><label class="form-label">Popis</label><textarea class="form-textarea" name="description"></textarea></div>
  ` : '';

  return `
    <form data-action="submit-register">
      <label class="form-label">Typ účtu</label>
      <div class="form-role-grid">
        <button type="button" class="form-role-btn ${role === 'user' ? 'is-selected' : ''}" data-action="set-register-role" data-role="user">Turista</button>
        <button type="button" class="form-role-btn ${role === 'organization' ? 'is-selected' : ''}" data-action="set-register-role" data-role="organization">Organizace</button>
        <button type="button" class="form-role-btn ${role === 'hotelier' ? 'is-selected' : ''}" data-action="set-register-role" data-role="hotelier">Podnik</button>
      </div>
      <input type="hidden" name="role" value="${role}" />
      ${role === 'user' ? `<div class="form-field"><label class="form-label">Zobrazované jméno</label><input class="form-input" name="displayName" required /></div>` : ''}
      <div class="form-field"><label class="form-label">E-mail</label><input class="form-input" type="email" name="email" required /></div>
      <div class="form-field"><label class="form-label">Heslo</label><input class="form-input" type="password" name="password" required minlength="8" /><p class="form-hint">Alespoň 8 znaků.</p></div>
      ${roleFields}
      <div class="form-field" style="display:flex;align-items:flex-start;gap:10px;">
        <input type="checkbox" name="termsAccepted" id="terms-checkbox" required style="margin-top:3px;width:16px;height:16px;flex-shrink:0;" />
        <label for="terms-checkbox" class="form-hint" style="margin-top:0;font-size:12.5px;line-height:1.5;">
          Souhlasím s <a href="/obchodni-podminky" target="_blank" rel="noopener" style="color:var(--c-primary-dark);text-decoration:underline;">obchodními podmínkami</a>
          a se <a href="/ochrana-osobnich-udaju" target="_blank" rel="noopener" style="color:var(--c-primary-dark);text-decoration:underline;">zpracováním osobních údajů</a> (GDPR).
        </label>
      </div>
      <button class="form-submit-btn" type="submit">Vytvořit účet</button>
    </form>`;
}

function renderRegionDistrictCityFields(prefix) {
  return `
    <div class="form-field"><label class="form-label">Kraj</label>
      <select class="form-select" name="region" data-action="region-select-change" required>
        <option value="">Vyberte kraj…</option>
        ${Object.keys(REGIONS).map((r) => `<option value="${r}">${r}</option>`).join('')}
      </select></div>
    <div class="form-field"><label class="form-label">Okres</label>
      <select class="form-select" name="district" id="district-select-${prefix}" data-action="district-change" required>
        <option value="">Nejprve vyberte kraj</option>
      </select></div>
    <div class="form-field">
      <label class="form-label">Obec</label>
      <select class="form-select" name="city" required>
        <option value="">Nejprve vyberte okres</option>
      </select>
    </div>`;
}

function onRegionSelectChangeForDistrict(selectEl) {
  const region = selectEl.value;
  const form = selectEl.closest('form');
  const districtSelect = form.querySelector('select[name="district"]');
  const citySelect = form.querySelector('select[name="city"]');
  const options = REGIONS[region] || [];
  districtSelect.innerHTML = options.length
    ? `<option value="">Vyberte okres…</option>${options.map((d) => `<option value="${d}">${d}</option>`).join('')}`
    : `<option value="">Nejprve vyberte kraj</option>`;
  if (citySelect) citySelect.innerHTML = '<option value="">Nejprve vyberte okres</option>';
}

function showFormErrorInPlace(form, message) {
  let el = form.querySelector('.form-error');
  if (!el) { el = document.createElement('div'); el.className = 'form-error'; form.prepend(el); }
  el.textContent = message;
}

async function handleLoginSubmit(form) {
  const fd = new FormData(form);
  accountFormState.formError = '';
  const btn = form.querySelector('button[type="submit"]');
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Přihlašuji…'; }
  try {
    const recaptcha_token = await getRecaptchaToken('login');
    const data = await apiPost('/api/auth/login', { email: fd.get('email'), password: fd.get('password'), recaptcha_token });
    if (data.twofa_required) {
      state._twofaToken = data.twofa_token;
      state._twofaStage = 'verify';
      renderApp();
      return;
    }
    finishLogin(data);
  } catch (err) {
    accountFormState.formError = err.message;
    showFormErrorInPlace(form, err.message);
    if (btn) { btn.disabled = false; btn.textContent = orig || 'Přihlásit se'; }
  }
}

function finishLogin(data) {
  setToken(data.token);
  setStoredUser(data.user);
  setStoredBusinesses(data.businesses || []);
  state.token = data.token;
  state.user = data.user;
  state.businesses = data.businesses || [];
  state._twofaStage = null;
  state._twofaToken = null;
  showToast(`Vítej zpět, ${data.user.display_name}!`);
  loadNotifications();
  if (typeof maybeStartOnboarding === 'function') maybeStartOnboarding(data.user);
  if (typeof maybeSubscribePush === 'function') maybeSubscribePush();
  // C3: po prihlásení s oneskorením požiadaj o push permisiu
  if (typeof maybeRequestPushPermission === 'function') maybeRequestPushPermission();
}

async function handleRegisterSubmit(form) {
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Vytvářím účet…'; }
  try {
    body.recaptcha_token = await getRecaptchaToken('register');
    await apiPost('/api/auth/register', body);
    showToast('Účet vytvořen! Můžeš se přihlásit.');
    state.authView = 'login';
    accountFormState.formError = '';
    renderApp();
  } catch (err) {
    accountFormState.formError = err.message;
    showFormErrorInPlace(form, err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Vytvořit účet'; }
  }
}

function handleLogout() {
  apiPost('/api/auth/logout', {}).catch(() => {});
  clearToken();
  clearStoredUser();
  state.token = null;
  state.user = null;
  state.businesses = [];
  state.adminPending = null;
  state.adminReports = null;
  state.adminVerifications = null;
  state.adminPosts = null;
  state.overlay = null;
  state.unreadNotifications = 0;
  state._pushSubscribed = false;
  state._pushPrompted = false;
  showToast('Byl jsi odhlášen.');
  renderApp();
}

function renderAccountHeaderCard() {
  const initial = (state.user.display_name || state.user.email || '?').charAt(0).toUpperCase();
  const roleLabel = { user: 'Turista', organization: 'Organizace', hotelier: 'Podnik', admin: 'Administrátor' }[state.user.role] || state.user.role;
  const avatar = state.user.avatar_url
    ? `<img src="${state.user.avatar_url}" alt="" class="account-avatar" style="object-fit:cover" />`
    : `<div class="account-avatar">${initial}</div>`;
  const handleHtml = state.user.handle ? `<p style="font-size:12px;color:var(--c-text-muted);margin-top:2px">@${escapeHtml(state.user.handle)}</p>` : '';
  return `
    <div class="account-header" data-action="open-profile" data-kind="user" data-id="${state.user.id}" style="cursor:pointer">
      ${avatar}
      <div style="flex:1">
        <p class="account-name">${escapeHtml(state.user.display_name)}</p>
        ${handleHtml}
        <span class="account-role-chip">${roleLabel}</span>
      </div>
      ${icon('chevronRight', { size: 18 })}
    </div>`;
}

function renderRoleSpecificContent() {
  if (state.user.role === 'user') return renderUserAboutSection();
  if (state.user.role === 'organization' || state.user.role === 'hotelier') return renderBusinessDashboard();
  if (state.user.role === 'admin') return renderAdminPanel();
  return '';
}

// USER
function renderUserAboutSection() {
  const u = state.user;
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">O mně</h3>
      <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-md);padding:16px;">
        ${u.handle ? `<p style="font-size:12.5px;color:var(--c-text-muted);margin-bottom:8px">@${escapeHtml(u.handle)}</p>` : ''}
        ${u.bio
          ? `<p style="font-size:14px;line-height:1.6">${escapeHtml(u.bio)}</p>`
          : '<p style="color:var(--c-text-muted);font-size:13.5px">Zatím žádné bio. Klikni na „Upravit profil".</p>'}
        <div style="margin-top:14px">
          <button class="profile-action-btn" data-action="edit-profile" data-kind="user" data-id="${u.id}">${icon('edit', { size: 15 })} Upravit profil</button>
        </div>
      </div>
    </div>

    <div class="profile-section">
      <h3 class="profile-section-title">Moje aktivita</h3>
      <div class="stat-cards">
        <button class="stat-card" data-action="open-badges" style="cursor:pointer;text-align:left">
          <div class="stat-card-value">${icon('chart', { size: 20 })}</div>
          <div class="stat-card-label">Moje odznaky</div>
        </button>
        <button class="stat-card" data-action="open-user-checkins" data-id="${u.id}" style="cursor:pointer;text-align:left">
          <div class="stat-card-value">${icon('location', { size: 20 })}</div>
          <div class="stat-card-label">Navštívená místa</div>
        </button>
        <button class="stat-card" data-action="open-wishlist" style="cursor:pointer;text-align:left">
          <div class="stat-card-value">${icon('bookmark', { size: 20 })}</div>
          <div class="stat-card-label">Chci navštívit</div>
        </button>
        <button class="stat-card" data-action="open-bookmarks" style="cursor:pointer;text-align:left">
          <div class="stat-card-value">${icon('bookmark', { size: 20 })}</div>
          <div class="stat-card-label">Uložené příspěvky</div>
        </button>
      </div>
    </div>`;
}

// ------------------------------------------------------------------
// B3: Všetky akcie podniku na jednom mieste v sekcii "Tvůj podnik"
// ------------------------------------------------------------------
function renderBusinessDashboard() {
  const businesses = state.businesses || [];
  if (businesses.length === 0) return '<p class="empty-state">K účtu není přiřazen žádný podnik.</p>';
  if (!accountFormState.postTargetBusiness) accountFormState.postTargetBusiness = businesses[0].id;
  const selected = businesses.find((b) => b.id === accountFormState.postTargetBusiness) || businesses[0];
  const targetFeed = selected.kind;

  if (state._verificationStatus === undefined) {
    state._verificationStatus = null;
    apiGet(`/api/profile/me/verification-status/${targetFeed}/${selected.id}`)
      .then((r) => { state._verificationStatus = r; renderApp(); })
      .catch(() => {});
  }

  const vreq = state._verificationStatus?.request;
  const isPending = vreq?.status === 'pending';
  const isVerified = Number(selected.is_verified);

  const postFormOpen = accountFormState._postFormOpen || false;

  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Tvůj podnik</h3>

      ${businesses.length > 1 ? `
        <div class="business-picker">
          ${businesses.map((b) => `<button class="business-chip ${b.id === selected.id ? 'is-selected' : ''}" data-action="select-business" data-id="${b.id}">${escapeHtml(b.name)} ${Number(b.is_verified) ? '✓' : ''}</button>`).join('')}
        </div>
      ` : ''}

      <div style="padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="profile-action-btn" data-action="open-profile" data-kind="${targetFeed}" data-id="${selected.id}">${icon('user', { size: 15 })} Profil</button>
        <button class="profile-action-btn" data-action="edit-profile" data-kind="${targetFeed}" data-id="${selected.id}">${icon('edit', { size: 15 })} Upravit</button>
        <button class="profile-action-btn" data-action="open-profile-stats" data-kind="${targetFeed}" data-id="${selected.id}">${icon('chart', { size: 15 })} Statistiky</button>
        <button class="profile-action-btn" data-action="open-event-create">${icon('calendar', { size: 15 })} Přidat akci</button>
        <button class="profile-action-btn" data-action="toggle-post-form" data-id="${selected.id}">${icon('image', { size: 15 })} Přidat příspěvek</button>
        ${!isVerified && !isPending ? `
          <button class="profile-action-btn" data-action="open-verification-request" data-kind="${targetFeed}" data-id="${selected.id}" data-name="${escapeAttr(selected.name)}">
            ${icon('shield', { size: 15 })} Ověřit
          </button>
        ` : ''}
      </div>

      ${!isVerified && isPending ? `
        <p class="form-hint" style="padding:0 16px 10px;color:var(--c-gold)">⏳ Žádost o ověření čeká na schválení.</p>
      ` : ''}
      ${isVerified ? `
        <p class="form-hint" style="padding:0 16px 10px;color:var(--c-primary-dark)">✓ Profil je ověřený</p>
      ` : ''}
    </div>

    ${postFormOpen ? renderInlineBusinessPostForm(selected, targetFeed) : ''}`;
}

function renderInlineBusinessPostForm(selected, targetFeed) {
  return `
    <div class="profile-section" id="inline-post-form">
      <h3 class="profile-section-title">Přidat příspěvek (max. 4 fotky)</h3>
      <form data-action="submit-business-post" data-business-id="${selected.id}" data-target-feed="${targetFeed}">
        <div class="file-drop" data-action="trigger-file-input">
          <input type="file" name="file" accept="image/*" multiple style="display:none" id="post-file-input" data-action="files-selected" />
          <span id="file-drop-label">${icon('image', { size: 22 })}<br/>Klikni pro výběr 1–4 fotek</span>
        </div>
        <div id="file-preview-grid" class="file-preview-grid"></div>
        ${renderRichEditor('text_html', 'Co je nového?')}

        <div class="post-link-fields">
          <p class="post-link-fields-title">${icon('globe', { size: 14 })} Přidat odkaz (nepovinné)</p>
          <div class="post-link-row">
            <input class="form-input" type="url" name="link_url" placeholder="https://…" />
            <input class="form-input" type="text" name="link_text" placeholder="Text odkazu" maxlength="40" />
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <button type="button" class="profile-action-btn" data-action="attach-geo" data-geo-label>${icon('location', { size: 15 })} Přidat polohu</button>
        </div>
        <button class="form-submit-btn" type="submit">Zveřejnit</button>
        <p class="form-hint">Fotky se automaticky zmenší. Zveřejní se ihned.</p>
      </form>
    </div>`;
}

function selectBusiness(id) {
  accountFormState.postTargetBusiness = id;
  state._verificationStatus = undefined;
  renderApp();
}

async function onFilesSelected(inputEl) {
  const files = Array.from(inputEl.files || []).slice(0, 4);
  if (files.length === 0) return;
  const label = document.getElementById('file-drop-label');
  const drop = inputEl.closest('.file-drop');
  const grid = document.getElementById('file-preview-grid');
  if (!label || !drop || !grid) return;
  drop.classList.add('has-file');
  label.textContent = `Zpracovávám ${files.length}…`;
  const compressed = [];
  for (const f of files) {
    try {
      const c = await compressImage(f, { maxDim: 1600, quality: 0.82 });
      compressed.push(c);
    } catch (err) {
      console.error('Kompresia zlyhala:', err);
      compressed.push(f);
    }
  }
  accountFormState.postFiles = compressed;
  label.textContent = `✓ Připraveno ${compressed.length}`;
  grid.innerHTML = compressed.map((f) => {
    const url = URL.createObjectURL(f);
    return `<div class="file-preview-item"><img src="${url}" /><button type="button" class="file-preview-remove" data-action="remove-post-file" data-name="${escapeAttr(f.name)}">${icon('close', { size: 14 })}</button></div>`;
  }).join('');
}

function removePostFile(name) {
  accountFormState.postFiles = accountFormState.postFiles.filter((f) => f.name !== name);
  const grid = document.getElementById('file-preview-grid');
  if (!grid) return;
  if (accountFormState.postFiles.length === 0) {
    grid.innerHTML = '';
    document.getElementById('file-drop-label').textContent = 'Klikni pro výběr 1–4 fotek';
    document.querySelector('.file-drop')?.classList.remove('has-file');
    return;
  }
  grid.innerHTML = accountFormState.postFiles.map((f) => {
    const url = URL.createObjectURL(f);
    return `<div class="file-preview-item"><img src="${url}" /><button type="button" class="file-preview-remove" data-action="remove-post-file" data-name="${escapeAttr(f.name)}">${icon('close', { size: 14 })}</button></div>`;
  }).join('');
}

async function handleBusinessPostSubmit(form) {
  const businessId = form.dataset.businessId;
  const targetFeed = form.dataset.targetFeed;
  const files = accountFormState.postFiles;
  if (!files || files.length === 0) { showToast('Vyber alespoň jednu fotku.'); return; }

  const fd = new FormData();
  files.forEach((f) => fd.append('file', f, f.name));
  fd.set('business_id', businessId);
  fd.set('target_feed', targetFeed);

  let html = getEditorHtml(form);

  const linkUrl = (form.querySelector('[name="link_url"]')?.value || '').trim();
  const linkText = (form.querySelector('[name="link_text"]')?.value || '').trim();
  if (linkUrl) {
    const safeUrl = /^https?:\/\//i.test(linkUrl) ? linkUrl : 'https://' + linkUrl;
    const label = linkText || safeUrl;
    html += `<p><a href="${escapeAttr(safeUrl)}">${escapeHtml(label)}</a></p>`;
  }

  fd.set('text_html', html);
  fd.set('text', html.replace(/<[^>]*>/g, ' ').trim());

  const geoLat = form.dataset.geoLat || '';
  const geoLng = form.dataset.geoLng || '';
  const geoPlace = form.dataset.geoPlace || '';
  if (geoLat) fd.set('geo_lat', geoLat);
  if (geoLng) fd.set('geo_lng', geoLng);
  if (geoPlace) fd.set('geo_place', geoPlace);

  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Nahrávám…'; }

  try {
    await apiPost('/api/posts', fd);
    showToast('Příspěvek zveřejněn!');
    if (state.socialFeeds[targetFeed]) state.socialFeeds[targetFeed].items = [];
    accountFormState.postFiles = [];
    accountFormState._postFormOpen = false;
    renderApp();
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Zveřejnit'; }
  }
}

// STATISTIKY
async function openProfileStats(kind, id) {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'profile-stats', kind, id };
  state._profileStats = null;
  renderApp();
  try {
    const data = await apiGet(`/api/profile/${kind}/${id}/stats`);
    state._profileStats = data;
    renderApp();
  } catch (err) {
    showToast(err.message);
    closeOverlay();
  }
}

function renderProfileStatsOverlay() {
  const s = state._profileStats;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Statistiky')}
      ${s === null ? '<p class="empty-state">Načítám…</p>' : `
        <div class="profile-section">
          <div class="stat-cards">
            <div class="stat-card"><div class="stat-card-value">${fmt(s.posts)}</div><div class="stat-card-label">Příspěvků</div></div>
            <div class="stat-card"><div class="stat-card-value">${fmt(s.events)}</div><div class="stat-card-label">Akce</div></div>
            <div class="stat-card"><div class="stat-card-value">${fmt(s.followers)}</div><div class="stat-card-label">Sledujících</div></div>
            <div class="stat-card"><div class="stat-card-value">${fmt(s.likes)}</div><div class="stat-card-label">Isker</div></div>
            <div class="stat-card"><div class="stat-card-value">${fmt(s.comments)}</div><div class="stat-card-label">Komentářů</div></div>
          </div>
        </div>
        ${s.last_30_days?.length ? `
          <div class="profile-section">
            <h3 class="profile-section-title">Posledních 30 dní (příspěvky/den)</h3>
            <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-md);padding:16px">
              <div class="stats-bars">
                ${s.last_30_days.map((d) => `<div class="stats-bar" style="height:${Math.max(4, (d.n || 1) * 8)}px" title="${d.day}: ${d.n}"></div>`).join('')}
              </div>
            </div>
          </div>
        ` : ''}
      `}
    </div>`;
}

// FORGOT / RESET / 2FA login
function renderForgotPasswordOverlay() {
  return `
    <div class="page-scroll">
      ${renderBackHeader('Zapomenuté heslo')}
      <div class="auth-card">
        <p style="font-size:13.5px;color:var(--c-text-muted);margin-bottom:16px;">Zadej e-mail, kterým ses registroval.</p>
        <form data-action="submit-forgot">
          <div class="form-field"><label class="form-label">E-mail</label><input class="form-input" type="email" name="email" required /></div>
          <button class="form-submit-btn" type="submit">Poslat odkaz</button>
        </form>
      </div>
    </div>`;
}

async function handleForgotSubmit(form) {
  const fd = new FormData(form);
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Odesílám…'; }
  try {
    await apiPost('/api/auth/forgot-password', { email: fd.get('email') });
    showToast('Pokud e-mail existuje, dorazí odkaz.');
    closeOverlay();
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Poslat odkaz'; }
  }
}

function renderResetPasswordOverlay(token) {
  return `
    <div class="page-scroll">
      ${renderBackHeader('Nové heslo')}
      <div class="auth-card">
        <form data-action="submit-reset" data-token="${token}">
          <div class="form-field"><label class="form-label">Nové heslo (min. 8 znaků)</label><input class="form-input" type="password" name="password" minlength="8" required /></div>
          <button class="form-submit-btn" type="submit">Uložit heslo</button>
        </form>
      </div>
    </div>`;
}

async function handleResetSubmit(form) {
  const fd = new FormData(form);
  try {
    await apiPost('/api/auth/reset-password', { token: form.dataset.token, password: fd.get('password') });
    showToast('Heslo změněno. Přihlas se.');
    state.overlay = null;
    state.authView = 'login';
    renderApp();
  } catch (err) { showToast(err.message); }
}

async function resendVerification() {
  try {
    await apiPost('/api/auth/resend-verification', {});
    showToast('Poslali jsme nový odkaz.');
  } catch (err) { showToast(err.message); }
}

function renderTwoFAOverlay() {
  return `
    <div class="page-scroll">
      ${renderBackHeader('Dvoufázové ověření')}
      <div class="auth-card">
        <form data-action="submit-2fa-login">
          <div class="form-field"><label class="form-label">Kód</label><input class="form-input" name="code" required autofocus autocomplete="one-time-code" /></div>
          <button class="form-submit-btn" type="submit">Ověřit a přihlásit</button>
        </form>
      </div>
    </div>`;
}

async function handleTwoFALogin(form) {
  const code = form.querySelector('input[name="code"]').value.trim();
  try {
    const data = await apiPost('/api/auth/verify-2fa', { twofa_token: state._twofaToken, code });
    finishLogin(data);
  } catch (err) { showToast(err.message); }
}

// ADMIN
async function loadAdminPending() {
  try { state.adminPending = await apiGet('/api/admin/pending'); }
  catch { state.adminPending = { organizations: [], accommodation: [], restaurants: [] }; }
  finally { state.adminPendingLoading = false; if (state.tab === 'account') renderApp(); }
}

async function loadAdminReports() {
  try { const d = await apiGet('/api/admin/reports'); state.adminReports = d.reports; }
  catch { state.adminReports = []; }
  finally { state.adminReportsLoading = false; if (state.tab === 'account') renderApp(); }
}

async function loadAdminVerifications() {
  try { const d = await apiGet('/api/admin/verifications'); state.adminVerifications = d.requests || []; }
  catch { state.adminVerifications = []; }
  finally { if (state.tab === 'account') renderApp(); }
}

async function loadAdminPosts() {
  try { const d = await apiGet('/api/admin/posts'); state.adminPosts = d.posts || []; }
  catch { state.adminPosts = []; }
  finally { if (state.tab === 'account') renderApp(); }
}

function renderAdminPanel() {
  if (state.adminPending === null && !state.adminPendingLoading) { state.adminPendingLoading = true; loadAdminPending(); }
  if (state.adminReports === null && !state.adminReportsLoading) { state.adminReportsLoading = true; loadAdminReports(); }
  if (state.adminVerifications === null) loadAdminVerifications();
  if (state.adminPosts === null) loadAdminPosts();
  if (state.adminUserReports === null) loadAdminUserReports();
  if (state.adminStats === null) loadAdminStats();

  const tab = state._adminTab || 'overview';

  return `
    <div class="admin-tabs">
      <button class="admin-tab ${tab === 'overview' ? 'is-active' : ''}" data-action="admin-tab" data-tab="overview">Přehled</button>
      <button class="admin-tab ${tab === 'users' ? 'is-active' : ''}" data-action="admin-tab" data-tab="users">Uživatelé</button>
      <button class="admin-tab ${tab === 'verifications' ? 'is-active' : ''}" data-action="admin-tab" data-tab="verifications">Žádosti</button>
      <button class="admin-tab ${tab === 'reports' ? 'is-active' : ''}" data-action="admin-tab" data-tab="reports">Reporty</button>
      <button class="admin-tab ${tab === 'posts' ? 'is-active' : ''}" data-action="admin-tab" data-tab="posts">Příspěvky</button>
      <button class="admin-tab ${tab === 'tools' ? 'is-active' : ''}" data-action="admin-tab" data-tab="tools">Nástroje</button>
    </div>
    ${tab === 'overview' ? renderAdminOverview() : ''}
    ${tab === 'users' ? renderAdminUsers() : ''}
    ${tab === 'verifications' ? renderAdminVerifications() : ''}
    ${tab === 'reports' ? renderAdminReports() : ''}
    ${tab === 'posts' ? renderAdminPosts() : ''}
    ${tab === 'tools' ? renderAdminTools() : ''}
  `;
}

function renderAdminOverview() {
  const s = state.adminStats;
  if (!s) return '<p class="empty-state">Načítám…</p>';
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Celkem</h3>
      <div class="admin-stats-grid">
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.users)}</div><div class="admin-stat-label">Uživatelů</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.organizations)}</div><div class="admin-stat-label">Organizací</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.accommodation)}</div><div class="admin-stat-label">Ubytování</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.restaurants)}</div><div class="admin-stat-label">Gastro</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.posts)}</div><div class="admin-stat-label">Příspěvků</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.events)}</div><div class="admin-stat-label">Akce</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.comments)}</div><div class="admin-stat-label">Komentářů</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.checkins)}</div><div class="admin-stat-label">Check-inů</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.reviews)}</div><div class="admin-stat-label">Recenzí</div></div>
      </div>
    </div>
    ${s.top_organizations?.length ? `
      <div class="profile-section">
        <h3 class="profile-section-title">Nejaktivnější organizace</h3>
        ${s.top_organizations.map((o) => `
          <div class="admin-user-row">
            <div class="admin-user-avatar">${(o.name || '?').charAt(0).toUpperCase()}</div>
            <div class="admin-user-info">
              <p class="admin-user-name">${escapeHtml(o.name)}</p>
              <p class="admin-user-meta">${o.post_count} příspěvků</p>
            </div>
          </div>`).join('')}
      </div>
    ` : ''}
    <div class="profile-section">
      <h3 class="profile-section-title">Rozšířené nástroje</h3>
      <button class="settings-row" data-action="open-broadcast-push">${icon('bell', { size: 17 })} Poslat push všem uživatelům</button>
    </div>`;
}

function renderAdminUsers() {
  const users = state.adminUsers;
  const counts = state.adminUsersCounts;
  const q = state._adminUserQuery || '';
  const role = state._adminUserRole || '';
  const status = state._adminUserStatus || '';

  return `
    <div class="admin-search-bar">
      <input class="admin-search-input" type="search" placeholder="Hledat jméno, e-mail, handle…" value="${escapeAttr(q)}" data-action="admin-user-search" />
      <select class="admin-filter-select" data-action="admin-user-role-filter">
        <option value="" ${!role ? 'selected' : ''}>Všechny role</option>
        <option value="user" ${role === 'user' ? 'selected' : ''}>Uživatel</option>
        <option value="organization" ${role === 'organization' ? 'selected' : ''}>Organizace</option>
        <option value="hotelier" ${role === 'hotelier' ? 'selected' : ''}>Podnik</option>
        <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
      <select class="admin-filter-select" data-action="admin-user-status-filter">
        <option value="" ${!status ? 'selected' : ''}>Všechny stavy</option>
        <option value="active" ${status === 'active' ? 'selected' : ''}>Aktivní</option>
        <option value="suspended" ${status === 'suspended' ? 'selected' : ''}>Pozastavení</option>
      </select>
    </div>
    ${counts ? `
      <p class="user-list-meta" style="padding:0 16px 12px">
        Celkem: ${counts.total || 0} · Uživatelé: ${counts.users || 0} · Organizace: ${counts.organizations || 0} · Podniky: ${counts.hoteliers || 0} · Pozastavení: ${counts.suspended || 0}
      </p>
    ` : ''}
    ${users == null ? '<p class="empty-state">Načítám…</p>'
      : users.length === 0 ? '<p class="empty-state">Žádní uživatelé.</p>'
      : users.map((u) => `
        <div class="admin-user-row">
          <div class="admin-user-avatar">${(u.display_name || u.email || '?').charAt(0).toUpperCase()}</div>
          <div class="admin-user-info">
            <p class="admin-user-name">${escapeHtml(u.display_name || '(bez jména)')}</p>
            <p class="admin-user-meta">${escapeHtml(u.email)}${u.handle ? ` · @${escapeHtml(u.handle)}` : ''}</p>
            <span class="admin-user-role role-${u.role}">${u.role}</span>
            ${u.status === 'suspended' ? '<span class="admin-user-role status-suspended" style="margin-left:4px">Pozastaven</span>' : ''}
          </div>
          <div class="admin-user-actions">
            <button data-action="admin-user-detail" data-id="${u.id}" title="Detail">${icon('more', { size: 16 })}</button>
          </div>
        </div>`).join('')}
  `;
}

function renderAdminVerifications() {
  const verifs = state.adminVerifications;
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Žádosti o ověření (${verifs ? verifs.length : '…'})</h3>
      ${verifs === null ? '<p class="empty-state">Načítám…</p>'
        : verifs.length === 0 ? '<p class="empty-state">Žádné žádosti.</p>'
        : verifs.map((v) => `
          <div class="admin-list-item" style="flex-direction:column;align-items:stretch;gap:8px">
            <div class="admin-list-info">
              <p class="admin-list-title">${escapeHtml(v.business_name || v.user_name || 'Podnik')}</p>
              <p class="admin-list-meta">Žadatel: ${escapeHtml(v.user_name || '')} (${escapeHtml(v.user_email || '')})</p>
              ${v.note ? `<p class="admin-list-meta" style="font-style:italic">„${escapeHtml(v.note)}"</p>` : ''}
              <p class="admin-list-meta">Předloženo: ${timeAgo(v.created_at)}</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${v.doc_url ? `<a class="profile-action-btn" href="${escapeAttr(v.doc_url)}" target="_blank" rel="noopener">${icon('image', { size: 14 })} Otevřít dokument</a>` : '<span class="admin-list-meta" style="color:#B3273C">⚠ Bez dokumentu</span>'}
              <button class="admin-approve-btn" data-action="approve-verification" data-id="${v.id}">Schválit</button>
              <button class="admin-delete-btn" data-action="reject-verification" data-id="${v.id}">Zamítnout</button>
            </div>
          </div>`).join('')}
    </div>`;
}

function renderAdminReports() {
  const posts = state.adminReports;
  const users = state.adminUserReports;
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Reporty příspěvků (${posts ? posts.length : '…'})</h3>
      ${posts === null ? '<p class="empty-state">Načítám…</p>'
        : posts.length === 0 ? '<p class="empty-state">Žádné reporty.</p>'
        : posts.map((r) => `
          <div class="admin-list-item">
            <div class="admin-list-info">
              <p class="admin-list-title">${(r.text_content || '').slice(0, 60) || '(bez textu)'}</p>
              <p class="admin-list-meta">Nahlásil: ${r.reporter_name || '?'}${r.reason ? ` · ${r.reason}` : ''}</p>
            </div>
            <button class="admin-delete-btn" data-action="delete-reported-post" data-post-id="${r.post_id}" data-report-id="${r.id}">Smazat</button>
          </div>`).join('')}
    </div>

    <div class="profile-section">
      <h3 class="profile-section-title">Reporty uživatelů (${users ? users.length : '…'})</h3>
      ${users === null ? '<p class="empty-state">Načítám…</p>'
        : users.length === 0 ? '<p class="empty-state">Žádné reporty.</p>'
        : users.map((r) => `
          <div class="admin-list-item">
            <div class="admin-list-info">
              <p class="admin-list-title">${escapeHtml(r.target_name || '(bez jména)')} ${r.target_handle ? `· @${escapeHtml(r.target_handle)}` : ''}</p>
              <p class="admin-list-meta">Nahlásil: ${escapeHtml(r.reporter_name || '?')}${r.reason ? ` · ${r.reason}` : ''}</p>
            </div>
            <button class="admin-delete-btn" data-action="resolve-user-report" data-id="${r.id}">Vyřešit</button>
          </div>`).join('')}
    </div>`;
}

function renderAdminPosts() {
  const posts = state.adminPosts;
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Nedávné příspěvky (${posts ? posts.length : '…'})</h3>
      ${posts === null ? '<p class="empty-state">Načítám…</p>'
        : posts.length === 0 ? '<p class="empty-state">Žádné příspěvky.</p>'
        : posts.map((p) => `
          <div class="admin-list-item">
            <div class="admin-list-info">
              <p class="admin-list-title">${escapeHtml((p.text_content || '').slice(0, 60) || '(bez textu)')}</p>
              <p class="admin-list-meta">${escapeHtml(p.business_name || '')} · ${p.target_feed} · ${timeAgo(p.created_at)}</p>
            </div>
            <button class="admin-delete-btn" data-action="delete-admin-post" data-id="${p.id}">Smazat</button>
          </div>`).join('')}
    </div>`;
}

function renderAdminTools() {
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Nástroje</h3>
      <button class="settings-row" data-action="open-broadcast-push">${icon('bell', { size: 17 })} Poslat push všem uživatelům</button>
      <button class="settings-row" data-action="admin-backfill-handles">${icon('edit', { size: 17 })} Doplň handles uživatelům</button>
      <button class="settings-row" data-action="admin-seed-test">${icon('plus', { size: 17 })} Vytvořit testovací obsah</button>
      <button class="settings-row" data-action="admin-cleanup-test" style="color:#B3273C">${icon('trash', { size: 17 })} Odstranit testovací obsah</button>
    </div>`;
}

// ADMIN LOADERS + AKCIE
async function loadAdminStats() {
  try { state.adminStats = await apiGet('/api/admin/stats'); }
  catch { state.adminStats = { totals: {} }; }
  finally { if (state.tab === 'account') renderApp(); }
}

async function loadAdminUsers() {
  const q = state._adminUserQuery || '';
  const role = state._adminUserRole || '';
  const status = state._adminUserStatus || '';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  try {
    const data = await apiGet(`/api/admin/users?${params.toString()}`);
    state.adminUsers = data.users || [];
    state.adminUsersCounts = data.counts || null;
  } catch { state.adminUsers = []; }
  finally { if (state.tab === 'account') renderApp(); }
}

async function loadAdminUserReports() {
  try { const d = await apiGet('/api/admin/user-reports'); state.adminUserReports = d.reports || []; }
  catch { state.adminUserReports = []; }
  finally { if (state.tab === 'account') renderApp(); }
}

async function loadAdminPosts() {
  try { const d = await apiGet('/api/admin/posts'); state.adminPosts = d.posts || []; }
  catch { state.adminPosts = []; }
  finally { if (state.tab === 'account') renderApp(); }
}

async function suspendUser(id) {
  const reason = prompt('Důvod pozastavení (nepovinné):') || '';
  try {
    await apiPost(`/api/admin/users/${id}/suspend`, { reason });
    showToast('Uživatel pozastaven.');
    state.adminUsers = null;
    loadAdminUsers();
  } catch (err) { showToast(err.message); }
}

async function unsuspendUser(id) {
  try {
    await apiPost(`/api/admin/users/${id}/unsuspend`, {});
    showToast('Uživatel obnoven.');
    state.adminUsers = null;
    loadAdminUsers();
  } catch (err) { showToast(err.message); }
}

function changeUserRole(id) {
  openModal({
    title: 'Změnit roli uživatele',
    body: `
      <div class="form-field">
        <label class="form-label">Nová role</label>
        <select class="form-select" name="role" required>
          <option value="user">Turista</option>
          <option value="organization">Organizace</option>
          <option value="hotelier">Podnik</option>
          <option value="admin">Administrátor</option>
        </select>
      </div>`,
    submitLabel: 'Uložit roli',
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      try {
        await apiPost(`/api/admin/users/${id}/role`, { role: data.role });
        closeModal();
        showToast('Role změněna.');
        state.adminUsers = null;
        loadAdminUsers();
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

function openUserDetail(id) {
  openModal({
    title: 'Detail uživatele',
    body: '<div id="admin-user-detail-body" style="min-height:120px"><p style="color:var(--c-text-muted)">Načítám…</p></div>',
    submitLabel: 'Zavřít',
    onSubmit: () => { closeModal(); },
  });
  setTimeout(async () => {
    const el = document.getElementById('admin-user-detail-body');
    if (!el) return;
    try {
      const d = await apiGet(`/api/admin/users/${id}/detail`);
      el.innerHTML = `
        <p style="font-weight:700;font-size:14px;margin-bottom:4px">${escapeHtml(d.user.display_name || '')}</p>
        <p style="font-size:12.5px;color:var(--c-text-muted);margin-bottom:12px">${escapeHtml(d.user.email)}${d.user.handle ? ` · @${escapeHtml(d.user.handle)}` : ''}</p>
        <div class="admin-stats-grid" style="padding:0;margin-bottom:12px">
          <div class="admin-stat-box"><div class="admin-stat-value">${d.stats.posts}</div><div class="admin-stat-label">Příspěvků</div></div>
          <div class="admin-stat-box"><div class="admin-stat-value">${d.stats.comments}</div><div class="admin-stat-label">Komentářů</div></div>
          <div class="admin-stat-box"><div class="admin-stat-value">${d.stats.checkins}</div><div class="admin-stat-label">Check-inů</div></div>
          <div class="admin-stat-box"><div class="admin-stat-value">${d.stats.followers}</div><div class="admin-stat-label">Sledujících</div></div>
        </div>
        <p style="font-size:12px;color:var(--c-text-muted)">Role: <strong>${d.user.role}</strong> · Status: <strong>${d.user.status}</strong></p>
        <p style="font-size:12px;color:var(--c-text-muted)">Registrace: ${timeAgo(d.user.created_at)}</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
          ${d.user.status === 'suspended'
            ? `<button class="profile-action-btn" data-action="admin-unsuspend-user" data-id="${id}">Obnovit účet</button>`
            : `<button class="profile-action-btn" style="color:#B3273C" data-action="admin-suspend-user" data-id="${id}">Pozastavit</button>`}
          <button class="profile-action-btn" data-action="admin-change-role" data-id="${id}">Změnit roli</button>
          ${!d.user.email_verified ? `<button class="profile-action-btn" data-action="admin-force-verify-email" data-id="${id}">Vynutit ověření e-mailu</button>` : ''}
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<p style="color:#B3273C">Chyba: ${escapeHtml(err.message)}</p>`;
    }
  }, 100);
}

function openBroadcastPush() {
  openModal({
    title: 'Poslat push všem uživatelům',
    body: `
      <div class="form-field"><label class="form-label">Titulek</label><input class="form-input" name="title" maxlength="100" required /></div>
      <div class="form-field"><label class="form-label">Zpráva</label><textarea class="form-textarea" name="message" maxlength="200" required></textarea></div>
      <div class="form-field"><label class="form-label">Odkaz (URL)</label><input class="form-input" name="url" placeholder="/?tab=events" /></div>`,
    submitLabel: 'Odeslat',
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      try {
        const res = await apiPost('/api/admin/broadcast-push', data);
        closeModal();
        showToast(`Odesláno ${res.sent} / ${res.users_targeted} uživatelům.`);
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

async function verifyBusiness(kind, id) {
  try {
    await apiPost(`/api/admin/verify/${kind}/${id}`, {});
    showToast('Profil ověřen.');
    state.adminPending = null;
    state.adminPendingLoading = false;
    renderApp();
  } catch (err) { showToast(err.message); }
}

function deleteReportedPost(postId, reportId) {
  openModal({
    title: 'Smazat nahlášený příspěvek?',
    body: `<p style="font-size:14px;line-height:1.6">Příspěvek bude skryt ze všech feedů.</p>`,
    submitLabel: 'Smazat',
    danger: true,
    onSubmit: async () => {
      state._modalLoading = true; renderApp();
      try {
        await apiDelete(`/api/admin/posts/${postId}`);
        closeModal();
        showToast('Odstraněno.');
        state.adminReports = null;
        state.adminReportsLoading = false;
        renderApp();
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

function deleteAdminPost(postId) {
  openModal({
    title: 'Smazat příspěvek?',
    body: `<p style="font-size:14px;line-height:1.6">Příspěvek bude skryt ze všech feedů.</p>`,
    submitLabel: 'Smazat',
    danger: true,
    onSubmit: async () => {
      state._modalLoading = true; renderApp();
      try {
        await apiDelete(`/api/admin/posts/${postId}`);
        closeModal();
        showToast('Odstraněno.');
        state.adminPosts = null;
        renderApp();
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

async function approveVerification(id) {
  const note = prompt('Volitelná poznámka pro žadatele:', '') || '';
  try {
    await apiPost(`/api/admin/verifications/${id}/approve`, { note });
    showToast('Žádost schválena.');
    state.adminVerifications = null;
    renderApp();
  } catch (err) { showToast(err.message); }
}

async function rejectVerification(id) {
  const note = prompt('Důvod zamítnutí (nepovinné):', '') || '';
  try {
    await apiPost(`/api/admin/verifications/${id}/reject`, { note });
    showToast('Žádost zamítnuta.');
    state.adminVerifications = null;
    renderApp();
  } catch (err) { showToast(err.message); }
}

async function adminBackfillHandles() {
  if (!confirm('Doplnit handles všem uživatelům bez handle?')) return;
  try {
    const r = await apiPost('/api/admin/backfill-handles', {});
    showToast(`Hotovo: ${r.updated} / ${r.total}`);
  } catch (err) { showToast(err.message); }
}

async function adminSeedTest() {
  if (!confirm('Vytvořit testovací obsah?')) return;
  try {
    const r = await apiPost('/api/admin/seed-test-content', {});
    showToast(`Vytvořeno: ${r.users || 0} užív., ${r.businesses || 0} podniků, ${r.posts || 0} příspěvků`);
  } catch (err) { showToast(err.message); }
}

async function adminCleanupTest() {
  if (!confirm('Smazat všechen testovací obsah (prefix test_)?')) return;
  try {
    await apiPost('/api/admin/cleanup-test-content', {});
    showToast('Testovací obsah odstraněn.');
  } catch (err) { showToast(err.message); }
}

// VERIFICATION REQUEST
function openVerificationRequest(kind, id, name) {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'verification-request', kind, id, name, docFile: null, uploading: false };
  renderApp();
}

function renderVerificationRequestOverlay() {
  const o = state.overlay;
  return `
    <div class="page-scroll">
      ${renderBackHeader('Ověření účtu firmy')}
      <div class="profile-section">
        <p style="font-size:14px;line-height:1.6;margin-bottom:14px">
          Nahraj dokument, který potvrzuje, že provozuješ <strong>${escapeHtml(o.name)}</strong>.
        </p>
        <p style="font-size:12.5px;color:var(--c-text-muted);margin-bottom:14px">
          📄 PDF, JPG, PNG nebo WebP (max 10 MB).
        </p>
        <form data-action="submit-verification-request" data-kind="${o.kind}" data-id="${o.id}">
          <div class="file-drop ${o.docFile ? 'has-file' : ''}" data-action="trigger-verif-doc">
            <input type="file" accept="application/pdf,image/*" id="verif-doc-input" data-action="verif-doc-selected" style="display:none" />
            ${o.docFile ? `✓ ${escapeHtml(o.docFile.name)}` : `${icon('image', { size: 24 })}<br/>Klikni pro výběr dokumentu`}
          </div>
          <div class="form-field">
            <label class="form-label">Poznámka pro administrátora (nepovinné)</label>
            <textarea class="form-textarea" name="note" rows="3" maxlength="1000" placeholder="Např. IČO: 12345678"></textarea>
          </div>
          <button class="form-submit-btn" type="submit" ${o.uploading ? 'disabled' : ''}>
            ${o.uploading ? 'Odesílám…' : 'Odeslat žádost'}
          </button>
        </form>
      </div>
    </div>`;
}

async function onVerifDocSelected(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast('Soubor je příliš velký (max 10 MB).'); return; }
  state.overlay = { ...state.overlay, docFile: file };
  renderApp();
}

async function handleVerificationSubmit(form) {
  const { kind, id, docFile } = state.overlay;
  if (!docFile) { showToast('Vyber dokument.'); return; }
  state.overlay.uploading = true;
  renderApp();

  try {
    const fd = new FormData();
    fd.append('file', docFile);
    const up = await apiPost('/api/profile/me/upload-verification-doc', fd);

    const fd2 = new FormData(form);
    await apiPost('/api/profile/me/request-verification', {
      business_id: id,
      business_kind: kind,
      doc_url: up.url,
      note: (fd2.get('note') || '').toString(),
    });

    showToast('Žádost odeslána. Čekej na schválení.');
    state.overlay = null;
    state._verificationStatus = undefined;
    renderApp();
  } catch (err) {
    showToast(err.message);
    state.overlay.uploading = false;
    renderApp();
  }
}

// PUSH
async function handlePushToggle(checked) {
  if (checked) await enablePushNotifications();
  else await disablePushNotifications();
}
