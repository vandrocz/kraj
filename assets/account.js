// ============================================================
// SEKCE 5: MŮJ PROFIL — s honeypot + age checkbox
// ============================================================

const accountFormState = {
  registerRole: 'user',
  registerBusinessKind: 'accommodation',
  postTargetBusiness: null,
  postFiles: [],
  formError: '',
  formBusy: false,
  _postFormOpen: false,
};

function renderAccountPage() {
  if (!isLoggedIn()) {
    const html = `
      <div class="page-scroll">
        ${renderHeader(t('auth.myProfile'), `
          <button class="header-icon-btn" data-action="open-settings" aria-label="${escapeAttr(t('settings.title'))}">${icon('settings', { size: 19 })}</button>
        `)}
        <div class="welcome-hero">
          <img src="https://cdn.vandro.cz/Untitled15_20260522160351.png" alt="VANDRO" class="welcome-logo" />
          <h1 class="welcome-title">${escapeHtml(t('auth.welcomeTitle'))}</h1>
          <p class="welcome-lead">${escapeHtml(t('auth.welcomeLead'))}</p>
          <div class="welcome-features">
            <div class="welcome-feature"><span class="welcome-feature-icon">🏰</span><span>${escapeHtml(t('auth.welcomeFeature1'))}</span></div>
            <div class="welcome-feature"><span class="welcome-feature-icon">🏨</span><span>${escapeHtml(t('auth.welcomeFeature2'))}</span></div>
            <div class="welcome-feature"><span class="welcome-feature-icon">🍽️</span><span>${escapeHtml(t('auth.welcomeFeature3'))}</span></div>
            <div class="welcome-feature"><span class="welcome-feature-icon">👥</span><span>${escapeHtml(t('auth.welcomeFeature4'))}</span></div>
          </div>
        </div>
        ${renderAuthCard()}
      </div>`;
    // Google Sign-In init len ak máme cookie consent
    setTimeout(() => {
      const el = document.getElementById('google-signin-container');
      if (!el) return;
      if (el.children.length > 0) return;

      if (typeof hasValidCookieConsent === 'function' && !hasValidCookieConsent()) {
        el.innerHTML = '<p style="font-size:12.5px;color:var(--c-text-muted);text-align:center;padding:8px 0;">Google přihlášení se zobrazí po přijetí cookies.</p>';
        return;
      }
      if (typeof renderGoogleButton === 'function') {
        try { renderGoogleButton(el, handleGoogleCredential); } catch (e) { console.warn('Google init failed:', e); }
      }
    }, 100);
    return html;
  }

  const headerActions = `
    <button class="header-icon-btn" data-action="open-notifications" style="position:relative" aria-label="${escapeAttr(t('notifications.title'))}">
      ${icon('bell', { size: 19 })}
      ${state.unreadNotifications > 0 ? `<span class="nav-badge">${state.unreadNotifications > 9 ? '9+' : state.unreadNotifications}</span>` : ''}
    </button>
    <button class="header-icon-btn" data-action="open-settings" aria-label="${escapeAttr(t('settings.title'))}">${icon('settings', { size: 19 })}</button>
  `;

  return `
    <div class="page-scroll">
      ${renderHeader(t('auth.myProfile'), headerActions)}
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
        <p class="verify-banner-title">${escapeHtml(t('auth.verifyEmail'))}</p>
        <p class="verify-banner-text">${escapeHtml(t('auth.verifySentTo'))} <strong>${escapeHtml(state.user.email)}</strong>. <span style="color:var(--c-primary-dark);font-weight:700">${escapeHtml(t('auth.resendLink'))} →</span></p>
      </div>
    </div>`;
}

function renderAuthCard() {
  return `
    <div class="auth-card">
      <div class="auth-tabs">
        <button class="auth-tab ${state.authView === 'login' ? 'is-active' : ''}" data-action="set-auth-view" data-view="login">${escapeHtml(t('auth.loginTab'))}</button>
        <button class="auth-tab ${state.authView === 'register' ? 'is-active' : ''}" data-action="set-auth-view" data-view="register">${escapeHtml(t('auth.registerTab'))}</button>
      </div>
      ${accountFormState.formError ? `<div class="form-error">${escapeHtml(accountFormState.formError)}</div>` : ''}
      <div id="google-signin-container" style="display:flex;justify-content:center;margin-bottom:18px;max-width:100%;overflow:hidden;"></div>
      <div class="auth-divider"><span>${escapeHtml(t('common.or'))}</span></div>
      ${state.authView === 'login' ? renderLoginForm() : renderRegisterForm()}
      ${state.authView === 'login' ? `<p style="text-align:center;margin-top:14px;font-size:12.5px"><button type="button" data-action="open-forgot" style="color:var(--c-primary-dark);font-weight:600">${escapeHtml(t('auth.forgotPassword'))}</button></p>` : ''}
    </div>`;
}

function renderLoginForm() {
  return `
    <form data-action="submit-login">
      <div class="form-field"><label class="form-label">${escapeHtml(t('auth.email'))}</label><input class="form-input" type="email" name="email" required autocomplete="email" /></div>
      <div class="form-field"><label class="form-label">${escapeHtml(t('auth.password'))}</label><input class="form-input" type="password" name="password" required autocomplete="current-password" /></div>
      <button class="form-submit-btn" type="submit">${escapeHtml(t('auth.loginBtn'))}</button>
    </form>`;
}

function renderRegisterForm() {
  const role = accountFormState.registerRole;
  const kind = accountFormState.registerBusinessKind;

  const orgTypeOptions = [
    { value: 'hrad', label: tType('hrad') },
    { value: 'zamek', label: tType('zamek') },
    { value: 'muzeum', label: tType('muzeum') },
    { value: 'lyzarske_stredisko', label: tType('lyzarske_stredisko') },
    { value: 'galerie', label: tType('galerie') },
    { value: 'zoo', label: tType('zoo') },
    { value: 'prirodni_pamatka', label: tType('prirodni_pamatka') },
    { value: 'rozhledna', label: tType('rozhledna') },
    { value: 'zricenina', label: tType('zricenina') },
    { value: 'kostel', label: tType('kostel') },
    { value: 'technicka_pamatka', label: tType('technicka_pamatka') },
    { value: 'jine', label: tType('jine') },
  ];

  const accTypeOptions = [
    { value: 'hotel', label: tType('hotel') },
    { value: 'penzion', label: tType('penzion') },
    { value: 'chata', label: tType('chata') },
    { value: 'chalupa', label: tType('chalupa') },
    { value: 'kemp', label: tType('kemp') },
    { value: 'apartman', label: tType('apartman') },
    { value: 'glamping', label: tType('glamping') },
    { value: 'hostel', label: tType('hostel') },
    { value: 'ubytovna', label: tType('ubytovna') },
    { value: 'jine', label: tType('jine') },
  ];

  const restTypeOptions = [
    { value: 'restaurace', label: tType('restaurace') },
    { value: 'kavarna', label: tType('kavarna') },
    { value: 'hospoda', label: tType('hospoda') },
    { value: 'pivovar', label: tType('pivovar') },
    { value: 'bistro', label: tType('bistro') },
    { value: 'cukrarna', label: tType('cukrarna') },
    { value: 'vinarna', label: tType('vinarna') },
    { value: 'food_truck', label: tType('food_truck') },
    { value: 'jine', label: tType('jine') },
  ];

  const roleFields = role === 'organization' ? `
    <div class="form-field">
      <label class="form-label">${escapeHtml(t('auth.registerOrgName'))}</label>
      <input class="form-input" name="orgName" required placeholder="${escapeAttr(t('auth.registerOrgNamePh'))}" />
    </div>
    <div class="form-field">
      <label class="form-label">${escapeHtml(t('auth.registerType'))}</label>
      <select class="form-select" name="orgType" required>
        ${orgTypeOptions.map((t2) => `<option value="${t2.value}">${escapeHtml(t2.label)}</option>`).join('')}
      </select>
    </div>
    ${renderRegionDistrictCityFields('reg')}
    <div class="form-field"><label class="form-label">${escapeHtml(t('auth.registerDescription'))}</label><textarea class="form-textarea" name="description"></textarea></div>
  ` : role === 'hotelier' ? `
    <div class="form-role-grid" style="grid-template-columns:repeat(2,1fr)">
      <button type="button" class="form-role-btn ${kind === 'accommodation' ? 'is-selected' : ''}" data-action="set-business-kind" data-kind="accommodation">${escapeHtml(t('nav.accommodation'))}</button>
      <button type="button" class="form-role-btn ${kind === 'gastro' ? 'is-selected' : ''}" data-action="set-business-kind" data-kind="gastro">${escapeHtml(t('nav.gastro'))}</button>
    </div>
    <input type="hidden" name="businessKind" value="${kind}" />
    <div class="form-field">
      <label class="form-label">${escapeHtml(t('auth.registerBusinessName'))}</label>
      <input class="form-input" name="businessName" required placeholder="${escapeAttr(t('auth.registerBusinessNamePh'))}" />
    </div>
    <div class="form-field">
      <label class="form-label">${escapeHtml(t('auth.registerType'))}</label>
      <select class="form-select" name="businessType" required>
        ${(kind === 'accommodation' ? accTypeOptions : restTypeOptions).map((t2) => `<option value="${t2.value}">${escapeHtml(t2.label)}</option>`).join('')}
      </select>
    </div>
    ${kind === 'gastro' ? `<div class="form-field"><label class="form-label">${escapeHtml(t('profile.cuisine'))}</label>
      <select class="form-select" name="cuisineType">
        <option value="ceska">${escapeHtml(tType('ceska'))}</option>
        <option value="italska">${escapeHtml(tType('italska'))}</option>
        <option value="asijska">${escapeHtml(tType('asijska'))}</option>
        <option value="vegan">${escapeHtml(tType('vegan'))}</option>
      </select></div>`
      : `<div class="form-field"><label class="form-label">${escapeHtml(t('profile.capacity'))}</label><input class="form-input" type="number" name="capacity" min="1" /></div>`}
    ${renderRegionDistrictCityFields('reg')}
    <div class="form-field"><label class="form-label">${escapeHtml(t('auth.registerDescription'))}</label><textarea class="form-textarea" name="description"></textarea></div>
  ` : '';

  return `
    <form data-action="submit-register">
      <label class="form-label">${escapeHtml(t('auth.registerRole'))}</label>
      <div class="form-role-grid">
        <button type="button" class="form-role-btn ${role === 'user' ? 'is-selected' : ''}" data-action="set-register-role" data-role="user">${escapeHtml(t('auth.roleUser'))}</button>
        <button type="button" class="form-role-btn ${role === 'organization' ? 'is-selected' : ''}" data-action="set-register-role" data-role="organization">${escapeHtml(t('auth.roleOrg'))}</button>
        <button type="button" class="form-role-btn ${role === 'hotelier' ? 'is-selected' : ''}" data-action="set-register-role" data-role="hotelier">${escapeHtml(t('auth.roleHotelier'))}</button>
      </div>
      <input type="hidden" name="role" value="${role}" />

      <!-- Honeypot pole — skryté pred ľuďmi, boti ho vyplnia -->
      <div style="position:absolute;left:-9999px;top:-9999px;height:0;width:0;overflow:hidden" aria-hidden="true">
        <label for="website-hp">Nevypĺňaj toto pole</label>
        <input type="text" id="website-hp" name="website" tabindex="-1" autocomplete="off" />
      </div>

      ${role === 'user' ? `
        <div class="form-field">
          <label class="form-label">${escapeHtml(t('auth.displayName'))}</label>
          <input class="form-input" name="displayName" required placeholder="např. Jan Novák" />
        </div>
      ` : `
        <div class="form-field">
          <label class="form-label">${escapeHtml(t('auth.displayNameBusiness'))}</label>
          <input class="form-input" name="displayName" required placeholder="např. Hrad Tematín, Hospoda pod Lipou" />
          <p class="form-hint">${escapeHtml(t('auth.displayNameBusinessHint'))}</p>
        </div>
      `}
      <div class="form-field"><label class="form-label">${escapeHtml(t('auth.email'))}</label><input class="form-input" type="email" name="email" required /></div>
      <div class="form-field"><label class="form-label">${escapeHtml(t('auth.password'))}</label><input class="form-input" type="password" name="password" required minlength="8" /><p class="form-hint">${escapeHtml(t('auth.passwordHint'))}</p></div>
      ${roleFields}

      <div class="form-field" style="display:flex;align-items:flex-start;gap:10px;">
        <input type="checkbox" name="ageConfirmed" id="age-checkbox" required style="margin-top:3px;width:16px;height:16px;flex-shrink:0;" />
        <label for="age-checkbox" class="form-hint" style="margin-top:0;font-size:12.5px;line-height:1.5;">
          Potvrzuji, že mi je alespoň <strong>15 let</strong>.
        </label>
      </div>

      <div class="form-field" style="display:flex;align-items:flex-start;gap:10px;">
        <input type="checkbox" name="termsAccepted" id="terms-checkbox" required style="margin-top:3px;width:16px;height:16px;flex-shrink:0;" />
        <label for="terms-checkbox" class="form-hint" style="margin-top:0;font-size:12.5px;line-height:1.5;">
          ${escapeHtml(t('auth.termsText'))} <a href="/obchodni-podminky.html" target="_blank" rel="noopener" style="color:var(--c-primary-dark);text-decoration:underline;">${escapeHtml(t('auth.termsLink'))}</a>
          ${escapeHtml(t('auth.termsAnd'))} <a href="/ochrana-osobnich-udaju.html" target="_blank" rel="noopener" style="color:var(--c-primary-dark);text-decoration:underline;">${escapeHtml(t('auth.gdprLink'))}</a> ${escapeHtml(t('auth.gdprSuffix'))}
        </label>
      </div>

      <button class="form-submit-btn" type="submit">${escapeHtml(t('auth.registerBtn'))}</button>
    </form>`;
}

function renderRegionDistrictCityFields(prefix) {
  return `
    <div class="form-field"><label class="form-label">${escapeHtml(t('auth.registerRegion'))}</label>
      <select class="form-select" name="region" data-action="region-select-change" required>
        <option value="">${escapeHtml(t('auth.registerSelectRegion'))}</option>
        ${Object.keys(REGIONS).map((r) => `<option value="${r}">${r}</option>`).join('')}
      </select></div>
    <div class="form-field"><label class="form-label">${escapeHtml(t('auth.registerDistrict'))}</label>
      <select class="form-select" name="district" id="district-select-${prefix}" data-action="district-change" required>
        <option value="">${escapeHtml(t('auth.registerFirstRegion'))}</option>
      </select></div>
    <div class="form-field">
      <label class="form-label">${escapeHtml(t('auth.registerCity'))}</label>
      <select class="form-select" name="city" required>
        <option value="">${escapeHtml(t('auth.registerFirstDistrict'))}</option>
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
    ? `<option value="">${escapeHtml(t('auth.registerSelectDistrict'))}</option>${options.map((d) => `<option value="${d}">${d}</option>`).join('')}`
    : `<option value="">${escapeHtml(t('auth.registerFirstRegion'))}</option>`;
  if (citySelect) citySelect.innerHTML = `<option value="">${escapeHtml(t('auth.registerFirstDistrict'))}</option>`;
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
  if (btn) { btn.disabled = true; btn.textContent = t('common.sending'); }
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
    if (btn) { btn.disabled = false; btn.textContent = orig || t('auth.loginBtn'); }
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
  showToast(t('toasts.loginSuccess', { name: data.user.display_name }));
  loadNotifications();
  if (typeof maybeStartOnboarding === 'function') maybeStartOnboarding(data.user);
  if (typeof maybeSubscribePush === 'function') maybeSubscribePush();
  if (typeof maybeRequestPushPermission === 'function') maybeRequestPushPermission();
}

async function handleRegisterSubmit(form) {
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = t('common.sending'); }
  try {
    body.recaptcha_token = await getRecaptchaToken('register');
    await apiPost('/api/auth/register', body);
    showToast(t('toasts.accountCreated'));
    state.authView = 'login';
    accountFormState.formError = '';
    renderApp();
  } catch (err) {
    accountFormState.formError = err.message;
    showFormErrorInPlace(form, err.message);
    if (btn) { btn.disabled = false; btn.textContent = t('auth.registerBtn'); }
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
  if (state.lightbox) closeLightbox(true);
  showToast(t('toasts.logoutSuccess'));
  renderApp();
}

function renderAccountHeaderCard() {
  const initial = (state.user.display_name || state.user.email || '?').charAt(0).toUpperCase();
  const roleLabel = {
    user: t('auth.roleUser'),
    organization: t('auth.roleOrg'),
    hotelier: t('auth.roleHotelier'),
    admin: t('auth.admin'),
  }[state.user.role] || state.user.role;
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
        <span class="account-role-chip">${escapeHtml(roleLabel)}</span>
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

function renderUserAboutSection() {
  const u = state.user;
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('profile.oMe'))}</h3>
      <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-md);padding:16px;">
        ${u.handle ? `<p style="font-size:12.5px;color:var(--c-text-muted);margin-bottom:8px">@${escapeHtml(u.handle)}</p>` : ''}
        ${u.bio
          ? `<p style="font-size:14px;line-height:1.6">${escapeHtml(u.bio)}</p>`
          : `<p style="color:var(--c-text-muted);font-size:13.5px">${escapeHtml(t('profile.noBio'))}</p>`}
        <div style="margin-top:14px">
          <button class="profile-action-btn" data-action="edit-profile" data-kind="user" data-id="${u.id}">${icon('edit', { size: 15 })} ${escapeHtml(t('profile.editProfile'))}</button>
        </div>
      </div>
    </div>

    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('profile.myActivity'))}</h3>
      <div class="stat-cards">
        <button class="stat-card" data-action="open-badges" style="cursor:pointer;text-align:left">
          <div class="stat-card-value">${icon('chart', { size: 20 })}</div>
          <div class="stat-card-label">${escapeHtml(t('profile.myBadges'))}</div>
        </button>
        <button class="stat-card" data-action="open-create-story" style="cursor:pointer;text-align:left">
          <div class="stat-card-value">${icon('camera', { size: 20 })}</div>
          <div class="stat-card-label">${escapeHtml(t('stories.add'))}</div>
        </button>
        <button class="stat-card" data-action="open-user-checkins" data-id="${u.id}" style="cursor:pointer;text-align:left">
          <div class="stat-card-value">${icon('location', { size: 20 })}</div>
          <div class="stat-card-label">${escapeHtml(t('profile.visitedPlaces'))}</div>
        </button>
        <button class="stat-card" data-action="open-wishlist" style="cursor:pointer;text-align:left">
          <div class="stat-card-value">${icon('bookmark', { size: 20 })}</div>
          <div class="stat-card-label">${escapeHtml(t('profile.wantVisit'))}</div>
        </button>
        <button class="stat-card" data-action="open-bookmarks" style="cursor:pointer;text-align:left">
          <div class="stat-card-value">${icon('bookmark', { size: 20 })}</div>
          <div class="stat-card-label">${escapeHtml(t('profile.savedPosts'))}</div>
        </button>
      </div>
    </div>`;
}

function renderBusinessDashboard() {
  const businesses = state.businesses || [];
  if (businesses.length === 0) return `<p class="empty-state">${escapeHtml(t('profile.noBusiness'))}</p>`;
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
  const canAddMore = state.user.role === 'organization' || state.user.role === 'hotelier' || state.user.role === 'admin';

  // Story button s business kontextom
  const storyBtn = isLoggedIn() ? `
    <button class="profile-action-btn" data-action="open-create-story" data-business-id="${escapeAttr(selected.id)}" data-business-name="${escapeAttr(selected.name)}" style="background:var(--c-primary-light);color:var(--c-primary-dark);border-color:var(--c-primary)">
      ${icon('camera', { size: 15 })} ${escapeHtml(t('stories.add'))}
    </button>` : '';

  return `
    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('profile.yourBusiness'))}</h3>

      ${businesses.length > 1 ? `
        <div class="business-picker">
          ${businesses.map((b) => `<button class="business-chip ${b.id === selected.id ? 'is-selected' : ''}" data-action="select-business" data-id="${b.id}">${escapeHtml(b.name)} ${Number(b.is_verified) ? '✓' : ''}</button>`).join('')}
        </div>
      ` : ''}

      <div style="padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="profile-action-btn" data-action="open-profile" data-kind="${targetFeed}" data-id="${selected.id}">${icon('user', { size: 15 })} ${escapeHtml(t('profile.profileBtn'))}</button>
        <button class="profile-action-btn" data-action="edit-profile" data-kind="${targetFeed}" data-id="${selected.id}">${icon('edit', { size: 15 })} ${escapeHtml(t('profile.editBtn'))}</button>
        <button class="profile-action-btn" data-action="open-profile-stats" data-kind="${targetFeed}" data-id="${selected.id}">${icon('chart', { size: 15 })} ${escapeHtml(t('profile.statsBtn'))}</button>
        <button class="profile-action-btn" data-action="open-event-create">${icon('calendar', { size: 15 })} ${escapeHtml(t('profile.addEventBtn'))}</button>
        <button class="profile-action-btn" data-action="toggle-post-form" data-id="${selected.id}">${icon('image', { size: 15 })} ${escapeHtml(t('profile.addPostBtn'))}</button>
        ${storyBtn}
        ${!isVerified && !isPending ? `
          <button class="profile-action-btn" data-action="open-verification-request" data-kind="${targetFeed}" data-id="${selected.id}" data-name="${escapeAttr(selected.name)}">
            ${icon('shield', { size: 15 })} ${escapeHtml(t('profile.verifyBtn'))}
          </button>
        ` : ''}
        ${canAddMore ? `
          <button class="profile-action-btn" data-action="open-add-business" style="background:var(--c-primary-light);color:var(--c-primary-dark);border-color:var(--c-primary)">
            ${icon('plus', { size: 15 })} ${escapeHtml(t('profile.addBusiness'))}
          </button>
        ` : ''}
      </div>

      ${!isVerified && isPending ? `<p class="form-hint" style="padding:0 16px 10px;color:var(--c-gold)">⏳ ${escapeHtml(t('profile.verificationPending'))}</p>` : ''}
      ${isVerified ? `<p class="form-hint" style="padding:0 16px 10px;color:var(--c-primary-dark)">✓ ${escapeHtml(t('profile.verified'))}</p>` : ''}
    </div>

    ${postFormOpen ? renderInlineBusinessPostForm(selected, targetFeed) : ''}`;
}
  const vreq = state._verificationStatus?.request;
  const isPending = vreq?.status === 'pending';
  const isVerified = Number(selected.is_verified);
  const postFormOpen = accountFormState._postFormOpen || false;
  const canAddMore = state.user.role === 'organization' || state.user.role === 'hotelier' || state.user.role === 'admin';

  return `
    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('profile.yourBusiness'))}</h3>

      ${businesses.length > 1 ? `
        <div class="business-picker">
          ${businesses.map((b) => `<button class="business-chip ${b.id === selected.id ? 'is-selected' : ''}" data-action="select-business" data-id="${b.id}">${escapeHtml(b.name)} ${Number(b.is_verified) ? '✓' : ''}</button>`).join('')}
        </div>
      ` : ''}

      <div style="padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="profile-action-btn" data-action="open-profile" data-kind="${targetFeed}" data-id="${selected.id}">${icon('user', { size: 15 })} ${escapeHtml(t('profile.profileBtn'))}</button>
        <button class="profile-action-btn" data-action="edit-profile" data-kind="${targetFeed}" data-id="${selected.id}">${icon('edit', { size: 15 })} ${escapeHtml(t('profile.editBtn'))}</button>
        <button class="profile-action-btn" data-action="open-profile-stats" data-kind="${targetFeed}" data-id="${selected.id}">${icon('chart', { size: 15 })} ${escapeHtml(t('profile.statsBtn'))}</button>
        <button class="profile-action-btn" data-action="open-event-create">${icon('calendar', { size: 15 })} ${escapeHtml(t('profile.addEventBtn'))}</button>
        <button class="profile-action-btn" data-action="toggle-post-form" data-id="${selected.id}">${icon('image', { size: 15 })} ${escapeHtml(t('profile.addPostBtn'))}</button>
        <button class="profile-action-btn" data-action="open-create-story" style="background:var(--c-primary-light);color:var(--c-primary-dark);border-color:var(--c-primary)">${icon('camera', { size: 15 })} ${escapeHtml(t('stories.add'))}</button>
        ${!isVerified && !isPending ? `
          <button class="profile-action-btn" data-action="open-verification-request" data-kind="${targetFeed}" data-id="${selected.id}" data-name="${escapeAttr(selected.name)}">
            ${icon('shield', { size: 15 })} ${escapeHtml(t('profile.verifyBtn'))}
          </button>
        ` : ''}
        ${canAddMore ? `
          <button class="profile-action-btn" data-action="open-add-business" style="background:var(--c-primary-light);color:var(--c-primary-dark);border-color:var(--c-primary)">
            ${icon('plus', { size: 15 })} ${escapeHtml(t('profile.addBusiness'))}
          </button>
        ` : ''}
      </div>

      ${!isVerified && isPending ? `<p class="form-hint" style="padding:0 16px 10px;color:var(--c-gold)">⏳ ${escapeHtml(t('profile.verificationPending'))}</p>` : ''}
      ${isVerified ? `<p class="form-hint" style="padding:0 16px 10px;color:var(--c-primary-dark)">✓ ${escapeHtml(t('profile.verified'))}</p>` : ''}
    </div>

    ${postFormOpen ? renderInlineBusinessPostForm(selected, targetFeed) : ''}`;
}

function openAddBusinessModal() {
  const role = state.user.role;
  const isOrg = role === 'organization' || role === 'admin';
  const isHotelier = role === 'hotelier' || role === 'admin';

  const kindOptions = [];
  if (isOrg) kindOptions.push({ value: 'organizations', label: t('auth.roleOrg') });
  if (isHotelier) {
    kindOptions.push({ value: 'accommodation', label: t('nav.accommodation') });
    kindOptions.push({ value: 'restaurants', label: t('nav.gastro') });
  }

  const initialKind = kindOptions[0]?.value || 'organizations';
  const initialTypeOptions = initialKind === 'organizations' ? TYPES.organization
    : initialKind === 'accommodation' ? TYPES.accommodation
    : TYPES.restaurant;

  openModal({
    title: t('profile.addBusinessTitle'),
    body: `
      ${kindOptions.length > 1 ? `
        <div class="form-field">
          <label class="form-label">${escapeHtml(t('profile.type'))}</label>
          <select class="form-select" name="kind" data-action="add-business-kind-change">
            ${kindOptions.map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('')}
          </select>
        </div>
      ` : `<input type="hidden" name="kind" value="${initialKind}" />`}

      <div class="form-field"><label class="form-label">Název</label><input class="form-input" name="name" required maxlength="200" /></div>

      <div class="form-field">
        <label class="form-label">${escapeHtml(t('profile.type'))}</label>
        <select class="form-select" name="type" id="add-business-type-select" required>
          ${initialTypeOptions.map((t2) => `<option value="${t2.value}">${escapeHtml(tType(t2.value))}</option>`).join('')}
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">${escapeHtml(t('auth.registerRegion'))}</label>
        <select class="form-select" name="region" data-action="region-select-change" required>
          <option value="">${escapeHtml(t('auth.registerSelectRegion'))}</option>
          ${Object.keys(REGIONS).map((r) => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">${escapeHtml(t('auth.registerDistrict'))}</label>
        <select class="form-select" name="district" data-action="district-change" required>
          <option value="">${escapeHtml(t('auth.registerFirstRegion'))}</option>
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">${escapeHtml(t('auth.registerCity'))}</label>
        <select class="form-select" name="city">
          <option value="">${escapeHtml(t('auth.registerFirstDistrict'))}</option>
        </select>
      </div>

      <div class="form-field"><label class="form-label">${escapeHtml(t('auth.registerDescription'))}</label><textarea class="form-textarea" name="description" maxlength="500"></textarea></div>
    `,
    submitLabel: t('profile.createBusiness'),
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      try {
        const res = await apiPost('/api/profile/me/business', {
          kind: data.kind,
          name: data.name,
          type: data.type,
          region: data.region,
          district: data.district,
          city: data.city || null,
          description: data.description || '',
        });
        state.businesses = [...(state.businesses || []), res.business];
        setStoredBusinesses(state.businesses);
        accountFormState.postTargetBusiness = res.business.id;
        state._verificationStatus = undefined;
        closeModal();
        showToast(t('toasts.saved'));
      } catch (err) {
        showToast(err.message);
        state._modalLoading = false;
        renderApp();
      }
    },
  });
}

function updateAddBusinessTypeOptions(kind) {
  const sel = document.getElementById('add-business-type-select');
  if (!sel) return;
  const typeOptions = kind === 'organizations' ? TYPES.organization
    : kind === 'accommodation' ? TYPES.accommodation
    : TYPES.restaurant;
  sel.innerHTML = typeOptions.map((t2) => `<option value="${t2.value}">${escapeHtml(tType(t2.value))}</option>`).join('');
}

function renderInlineBusinessPostForm(selected, targetFeed) {
  return `
    <div class="profile-section" id="inline-post-form">
      <h3 class="profile-section-title">${escapeHtml(t('post.newPost'))}</h3>
      <form data-action="submit-business-post" data-business-id="${selected.id}" data-target-feed="${targetFeed}">
        <div class="file-drop" data-action="trigger-file-input">
          <input type="file" name="file" accept="image/*" multiple style="display:none" id="post-file-input" data-action="files-selected" />
          <span id="file-drop-label">${icon('image', { size: 22 })}<br/>${escapeHtml(t('post.addPhoto'))}</span>
        </div>
        <div id="file-preview-grid" class="file-preview-grid"></div>
        ${renderRichEditor('text_html', t('post.caption'))}

        <div class="post-link-fields">
          <p class="post-link-fields-title">${icon('globe', { size: 14 })} ${escapeHtml(t('post.linkOptional'))}</p>
          <div class="post-link-row">
            <input class="form-input" type="url" name="link_url" placeholder="${escapeAttr(t('post.linkUrl'))}" />
            <input class="form-input" type="text" name="link_text" placeholder="${escapeAttr(t('post.linkText'))}" maxlength="40" />
          </div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <button type="button" class="profile-action-btn" data-action="attach-geo" data-geo-label>${icon('location', { size: 15 })} ${escapeHtml(t('post.addLocation'))}</button>
        </div>
        <button class="form-submit-btn" type="submit">${escapeHtml(t('post.publish'))}</button>
        <p class="form-hint">${escapeHtml(t('post.photoHint'))}</p>
      </form>
    </div>`;
}

function selectBusiness(id) {
  accountFormState.postTargetBusiness = id;
  accountFormState._postFormOpen = false;
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
  label.textContent = `${t('post.photoProcessing')} ${files.length}…`;
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
  label.textContent = `✓ ${t('post.photoReady')} ${compressed.length}`;
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
    document.getElementById('file-drop-label').textContent = t('post.addPhoto');
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
  if (!files || files.length === 0) { showToast(t('post.addPhoto')); return; }

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
  if (btn) { btn.disabled = true; btn.textContent = t('common.uploading'); }

  try {
    await apiPost('/api/posts', fd);
    showToast(t('toasts.postPublished'));
    if (state.socialFeeds[targetFeed]) state.socialFeeds[targetFeed].items = [];
    accountFormState.postFiles = [];
    accountFormState._postFormOpen = false;
    renderApp();
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = t('post.publish'); }
  }
}

function openCheckinCreate(kind, id, name) {
  if (!isLoggedIn()) { showToast(t('checkins.loginRequired')); switchTab('account'); return; }
  openModal({
    title: t('checkins.title'),
    body: `
      <p style="font-size:14px;margin-bottom:16px;color:var(--c-text-muted)">${escapeHtml(name || '')}</p>
      <div class="form-field">
        <label class="form-label">${escapeHtml(t('checkins.note'))}</label>
        <textarea class="form-textarea" name="note" maxlength="500" rows="4" placeholder="${escapeAttr(t('checkins.notePlaceholder'))}"></textarea>
      </div>`,
    submitLabel: t('checkins.addNote'),
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      try {
        const res = await apiPost('/api/checkins', {
          business_id: id,
          business_kind: kind,
          note: data.note || null,
        });
        closeModal();
        if (res.new_badges && res.new_badges.length > 0) {
          const list = res.new_badges.map((b) => `${tBadge(b.key, b.name)} L${b.level}`).join(', ');
          showToast(t('checkins.newBadge', { list }));
        } else if (res.already) {
          showToast(res.message || t('checkins.already'));
        } else {
          showToast(t('checkins.added'));
        }
        if (state.overlay?.type === 'profile') {
          delete state.profiles[`${state.overlay.kind}:${state.overlay.id}`];
          loadProfile(state.overlay.kind, state.overlay.id);
        }
      } catch (err) {
        showToast(err.message);
        state._modalLoading = false;
        renderApp();
      }
    },
  });
}

async function openProfileStats(kind, id) {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'profile-stats', kind, id };
  state._profileStats = null;
  state._profileStatsView = { metric: 'posts', period: 'week' };
  pushHistoryState('overlay');
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
  const view = state._profileStatsView || { metric: 'posts', period: 'week' };

  if (!s) return `<div class="page-scroll">${renderBackHeader(t('stats.title'))}<p class="empty-state">${escapeHtml(t('common.loading'))}</p></div>`;

  const daily = s.daily || {};
  const allDays = daily.posts || s.last_30_days || [];
  const slice = view.period === 'week' ? allDays.slice(-7) : allDays.slice(-30);
  const metricKey = view.metric || 'posts';
  const series = (daily[metricKey] || allDays).slice(-slice.length);

  const maxN = Math.max(1, ...series.map((d) => d.n || 0));
  const totalN = series.reduce((sum, d) => sum + (d.n || 0), 0);

  const chartWidth = 640;
  const chartHeight = 220;
  const paddingX = 20;
  const paddingY = 30;
  const innerW = chartWidth - paddingX * 2;
  const innerH = chartHeight - paddingY * 2;
  const barGap = 3;
  const barW = series.length > 0 ? Math.max(4, (innerW - barGap * (series.length - 1)) / series.length) : 10;

  const barsSvg = series.map((d, i) => {
    const x = paddingX + i * (barW + barGap);
    const h = maxN > 0 ? ((d.n || 0) / maxN) * innerH : 0;
    const y = chartHeight - paddingY - h;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2" fill="url(#statsGrad)" />`;
  }).join('');

  const labelStep = view.period === 'week' ? 1 : 5;
  const labelsSvg = series.map((d, i) => {
    if (i % labelStep !== 0 && i !== series.length - 1) return '';
    const x = paddingX + i * (barW + barGap) + barW / 2;
    const shortDay = (d.day || '').slice(8);
    const month = (d.day || '').slice(5, 7);
    return `<text x="${x.toFixed(1)}" y="${chartHeight - 8}" text-anchor="middle" font-size="10" fill="#64766D">${shortDay}.${month}.</text>`;
  }).join('');

  const metricLabels = {
    posts: t('stats.posts'),
    likes: t('stats.likes'),
    comments: t('stats.comments'),
    views: t('stats.views'),
    events: t('stats.events'),
  };

  return `
    <div class="page-scroll">
      ${renderBackHeader(t('stats.title'))}

      <div class="profile-section">
        <div class="stat-cards">
          <div class="stat-card"><div class="stat-card-value">${fmt(s.posts)}</div><div class="stat-card-label">${escapeHtml(t('stats.posts'))}</div></div>
          <div class="stat-card"><div class="stat-card-value">${fmt(s.events)}</div><div class="stat-card-label">${escapeHtml(t('stats.events'))}</div></div>
          <div class="stat-card"><div class="stat-card-value">${fmt(s.followers)}</div><div class="stat-card-label">${escapeHtml(t('stats.followers'))}</div></div>
          <div class="stat-card"><div class="stat-card-value">${fmt(s.likes)}</div><div class="stat-card-label">${escapeHtml(t('stats.likes'))}</div></div>
          <div class="stat-card"><div class="stat-card-value">${fmt(s.comments)}</div><div class="stat-card-label">${escapeHtml(t('stats.comments'))}</div></div>
          <div class="stat-card"><div class="stat-card-value">${fmt(s.views || 0)}</div><div class="stat-card-label">${escapeHtml(t('stats.views'))}</div></div>
        </div>
      </div>

      <div class="profile-section">
        <h3 class="profile-section-title">${escapeHtml(t('stats.chart'))}</h3>

        <div class="stats-controls">
          <div class="stats-control-group">
            <label class="stats-control-label">${escapeHtml(t('stats.metric'))}</label>
            <select class="form-select stats-control-select" data-action="stats-metric">
              <option value="posts" ${view.metric === 'posts' ? 'selected' : ''}>${escapeHtml(t('stats.posts'))}</option>
              <option value="likes" ${view.metric === 'likes' ? 'selected' : ''}>${escapeHtml(t('stats.likes'))}</option>
              <option value="comments" ${view.metric === 'comments' ? 'selected' : ''}>${escapeHtml(t('stats.comments'))}</option>
              <option value="views" ${view.metric === 'views' ? 'selected' : ''}>${escapeHtml(t('stats.views'))}</option>
              <option value="events" ${view.metric === 'events' ? 'selected' : ''}>${escapeHtml(t('stats.events'))}</option>
            </select>
          </div>
          <div class="stats-control-group">
            <label class="stats-control-label">${escapeHtml(t('stats.period'))}</label>
            <div class="stats-period-toggle">
              <button class="stats-period-btn ${view.period === 'week' ? 'is-active' : ''}" data-action="stats-period" data-period="week">${escapeHtml(t('stats.week'))}</button>
              <button class="stats-period-btn ${view.period === 'month' ? 'is-active' : ''}" data-action="stats-period" data-period="month">${escapeHtml(t('stats.month'))}</button>
            </div>
          </div>
        </div>

        <div class="stats-chart-wrap">
          <div class="stats-chart-head">
            <span class="stats-chart-title">${escapeHtml(metricLabels[metricKey] || metricKey)} · ${view.period === 'week' ? escapeHtml(t('stats.last7days')) : escapeHtml(t('stats.last30days'))}</span>
            <span class="stats-chart-total"><strong>${fmt(totalN)}</strong> ${escapeHtml(t('stats.total')).toLowerCase()}</span>
          </div>
          <svg class="stats-chart-svg" viewBox="0 0 ${chartWidth} ${chartHeight}" preserveAspectRatio="none" role="img">
            <defs>
              <linearGradient id="statsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#2FBF71" stop-opacity="1" />
                <stop offset="100%" stop-color="#1B8F52" stop-opacity="0.85" />
              </linearGradient>
            </defs>
            ${[0.25, 0.5, 0.75, 1].map((p) => {
              const y = chartHeight - paddingY - innerH * p;
              return `<line x1="${paddingX}" y1="${y.toFixed(1)}" x2="${chartWidth - paddingX}" y2="${y.toFixed(1)}" stroke="#E4ECE6" stroke-width="1" stroke-dasharray="3 3" />`;
            }).join('')}
            ${barsSvg}
            ${labelsSvg}
          </svg>
          ${series.every((d) => !d.n) ? `<p class="stats-chart-empty">${escapeHtml(t('stats.noData'))}</p>` : ''}
        </div>
      </div>
    </div>`;
}

function renderForgotPasswordOverlay() {
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('auth.forgotTitle'))}
      <div class="auth-card">
        <p style="font-size:13.5px;color:var(--c-text-muted);margin-bottom:16px;">${escapeHtml(t('auth.forgotLead'))}</p>
        <form data-action="submit-forgot">
          <div class="form-field"><label class="form-label">${escapeHtml(t('auth.email'))}</label><input class="form-input" type="email" name="email" required /></div>
          <button class="form-submit-btn" type="submit">${escapeHtml(t('auth.forgotBtn'))}</button>
        </form>
      </div>
    </div>`;
}

async function handleForgotSubmit(form) {
  const fd = new FormData(form);
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = t('common.sending'); }
  try {
    await apiPost('/api/auth/forgot-password', { email: fd.get('email') });
    showToast(t('toasts.linkSent'));
    closeOverlay();
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = t('auth.forgotBtn'); }
  }
}

function renderResetPasswordOverlay(token) {
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('auth.resetTitle'))}
      <div class="auth-card">
        <form data-action="submit-reset" data-token="${token}">
          <div class="form-field"><label class="form-label">${escapeHtml(t('auth.resetTitle'))} (min. 8)</label><input class="form-input" type="password" name="password" minlength="8" required /></div>
          <button class="form-submit-btn" type="submit">${escapeHtml(t('auth.resetBtn'))}</button>
        </form>
      </div>
    </div>`;
}

async function handleResetSubmit(form) {
  const fd = new FormData(form);
  try {
    await apiPost('/api/auth/reset-password', { token: form.dataset.token, password: fd.get('password') });
    showToast(t('toasts.passwordChanged'));
    state.overlay = null;
    state.authView = 'login';
    renderApp();
  } catch (err) { showToast(err.message); }
}

async function resendVerification() {
  try {
    await apiPost('/api/auth/resend-verification', {});
    showToast(t('toasts.linkSent'));
  } catch (err) { showToast(err.message); }
}

function renderTwoFAOverlay() {
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('auth.twofaTitle'))}
      <div class="auth-card">
        <form data-action="submit-2fa-login">
          <div class="form-field"><label class="form-label">${escapeHtml(t('auth.twofaCode'))}</label><input class="form-input" name="code" required autofocus autocomplete="one-time-code" /></div>
          <button class="form-submit-btn" type="submit">${escapeHtml(t('auth.twofaVerify'))}</button>
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

// ============================================================
// ADMIN PANEL
// ============================================================
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
      <button class="admin-tab ${tab === 'overview' ? 'is-active' : ''}" data-action="admin-tab" data-tab="overview">${escapeHtml(t('admin.overview'))}</button>
      <button class="admin-tab ${tab === 'users' ? 'is-active' : ''}" data-action="admin-tab" data-tab="users">${escapeHtml(t('admin.users'))}</button>
      <button class="admin-tab ${tab === 'verifications' ? 'is-active' : ''}" data-action="admin-tab" data-tab="verifications">${escapeHtml(t('admin.verifications'))}</button>
      <button class="admin-tab ${tab === 'reports' ? 'is-active' : ''}" data-action="admin-tab" data-tab="reports">${escapeHtml(t('admin.reports'))}</button>
      <button class="admin-tab ${tab === 'posts' ? 'is-active' : ''}" data-action="admin-tab" data-tab="posts">${escapeHtml(t('admin.posts'))}</button>
      <button class="admin-tab ${tab === 'tools' ? 'is-active' : ''}" data-action="admin-tab" data-tab="tools">${escapeHtml(t('admin.tools'))}</button>
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
  if (!s) return `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`;
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('admin.total'))}</h3>
      <div class="admin-stats-grid">
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.users)}</div><div class="admin-stat-label">${escapeHtml(t('admin.usersCount'))}</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.organizations)}</div><div class="admin-stat-label">${escapeHtml(t('admin.orgsCount'))}</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.accommodation)}</div><div class="admin-stat-label">${escapeHtml(t('admin.accCount'))}</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.restaurants)}</div><div class="admin-stat-label">${escapeHtml(t('admin.gastroCount'))}</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.posts)}</div><div class="admin-stat-label">${escapeHtml(t('admin.postsCount'))}</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.events)}</div><div class="admin-stat-label">${escapeHtml(t('admin.eventsCount'))}</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.comments)}</div><div class="admin-stat-label">${escapeHtml(t('admin.commentsCount'))}</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.checkins)}</div><div class="admin-stat-label">${escapeHtml(t('admin.checkinsCount'))}</div></div>
        <div class="admin-stat-box"><div class="admin-stat-value">${fmt(s.totals.reviews)}</div><div class="admin-stat-label">${escapeHtml(t('admin.reviewsCount'))}</div></div>
      </div>
    </div>
    ${s.top_organizations?.length ? `
      <div class="profile-section">
        <h3 class="profile-section-title">${escapeHtml(t('admin.topOrgs'))}</h3>
        ${s.top_organizations.map((o) => `
          <div class="admin-user-row">
            <div class="admin-user-avatar">${(o.name || '?').charAt(0).toUpperCase()}</div>
            <div class="admin-user-info">
              <p class="admin-user-name">${escapeHtml(o.name)}</p>
              <p class="admin-user-meta">${o.post_count} ${escapeHtml(t('admin.postsCount'))}</p>
            </div>
          </div>`).join('')}
      </div>
    ` : ''}
    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('admin.advancedTools'))}</h3>
      <button class="settings-row" data-action="open-broadcast-push">${icon('bell', { size: 17 })} ${escapeHtml(t('admin.sendPush'))}</button>
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
      <input class="admin-search-input" type="search" placeholder="${escapeAttr(t('admin.searchUsers'))}" value="${escapeAttr(q)}" data-action="admin-user-search" />
      <select class="admin-filter-select" data-action="admin-user-role-filter">
        <option value="" ${!role ? 'selected' : ''}>${escapeHtml(t('admin.allRoles'))}</option>
        <option value="user" ${role === 'user' ? 'selected' : ''}>${escapeHtml(t('admin.roleUser'))}</option>
        <option value="organization" ${role === 'organization' ? 'selected' : ''}>${escapeHtml(t('admin.roleOrg'))}</option>
        <option value="hotelier" ${role === 'hotelier' ? 'selected' : ''}>${escapeHtml(t('admin.roleHotelier'))}</option>
        <option value="admin" ${role === 'admin' ? 'selected' : ''}>${escapeHtml(t('admin.roleAdmin'))}</option>
      </select>
      <select class="admin-filter-select" data-action="admin-user-status-filter">
        <option value="" ${!status ? 'selected' : ''}>${escapeHtml(t('admin.allStates'))}</option>
        <option value="active" ${status === 'active' ? 'selected' : ''}>${escapeHtml(t('admin.stateActive'))}</option>
        <option value="suspended" ${status === 'suspended' ? 'selected' : ''}>${escapeHtml(t('admin.stateSuspended'))}</option>
      </select>
    </div>
    ${counts ? `
      <p class="user-list-meta" style="padding:0 16px 12px">
        ${escapeHtml(t('admin.totalLabel'))}: ${counts.total || 0} · ${escapeHtml(t('admin.userLabel'))}: ${counts.users || 0} · ${escapeHtml(t('admin.orgLabel'))}: ${counts.organizations || 0} · ${escapeHtml(t('admin.hotelierLabel'))}: ${counts.hoteliers || 0} · ${escapeHtml(t('admin.suspendedLabel'))}: ${counts.suspended || 0}
      </p>
    ` : ''}
    ${users == null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
      : users.length === 0 ? `<p class="empty-state">${escapeHtml(t('admin.noUsers'))}</p>`
      : users.map((u) => `
        <div class="admin-user-row">
          <div class="admin-user-avatar">${(u.display_name || u.email || '?').charAt(0).toUpperCase()}</div>
          <div class="admin-user-info">
            <p class="admin-user-name">${escapeHtml(u.display_name || '(—)')}</p>
            <p class="admin-user-meta">${escapeHtml(u.email)}${u.handle ? ` · @${escapeHtml(u.handle)}` : ''}</p>
            <span class="admin-user-role role-${u.role}">${u.role}</span>
            ${u.status === 'suspended' ? `<span class="admin-user-role status-suspended" style="margin-left:4px">${escapeHtml(t('admin.stateSuspended'))}</span>` : ''}
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
      <h3 class="profile-section-title">${escapeHtml(t('admin.verificationRequests'))} (${verifs ? verifs.length : '…'})</h3>
      ${verifs === null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
        : verifs.length === 0 ? `<p class="empty-state">${escapeHtml(t('admin.noRequests'))}</p>`
        : verifs.map((v) => `
          <div class="admin-list-item" style="flex-direction:column;align-items:stretch;gap:8px">
            <div class="admin-list-info">
              <p class="admin-list-title">${escapeHtml(v.business_name || v.user_name || '—')}</p>
              <p class="admin-list-meta">${escapeHtml(t('admin.applicant'))}: ${escapeHtml(v.user_name || '')} (${escapeHtml(v.user_email || '')})</p>
              ${v.note ? `<p class="admin-list-meta" style="font-style:italic">„${escapeHtml(v.note)}"</p>` : ''}
              <p class="admin-list-meta">${escapeHtml(t('admin.submitted'))}: ${timeAgo(v.created_at)}</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${v.doc_url ? `<a class="profile-action-btn" href="${escapeAttr(v.doc_url)}" target="_blank" rel="noopener">${icon('image', { size: 14 })} ${escapeHtml(t('admin.openDoc'))}</a>` : `<span class="admin-list-meta" style="color:#B3273C">${escapeHtml(t('admin.noDoc'))}</span>`}
              <button class="admin-approve-btn" data-action="approve-verification" data-id="${v.id}">${escapeHtml(t('admin.approve'))}</button>
              <button class="admin-delete-btn" data-action="reject-verification" data-id="${v.id}">${escapeHtml(t('admin.reject'))}</button>
            </div>
          </div>`).join('')}
    </div>`;
}

function renderAdminReports() {
  const posts = state.adminReports;
  const users = state.adminUserReports;
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('admin.postReports'))} (${posts ? posts.length : '…'})</h3>
      ${posts === null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
        : posts.length === 0 ? `<p class="empty-state">${escapeHtml(t('admin.noReports'))}</p>`
        : posts.map((r) => `
          <div class="admin-list-item">
            <div class="admin-list-info">
              <p class="admin-list-title">${(r.text_content || '').slice(0, 60) || '—'}</p>
              <p class="admin-list-meta">${escapeHtml(t('admin.reportedBy'))}: ${r.reporter_name || '?'}${r.reason ? ` · ${r.reason}` : ''}</p>
            </div>
            <button class="admin-delete-btn" data-action="delete-reported-post" data-post-id="${r.post_id}" data-report-id="${r.id}">${escapeHtml(t('common.delete'))}</button>
          </div>`).join('')}
    </div>

    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('admin.userReports'))} (${users ? users.length : '…'})</h3>
      ${users === null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
        : users.length === 0 ? `<p class="empty-state">${escapeHtml(t('admin.noReports'))}</p>`
        : users.map((r) => `
          <div class="admin-list-item">
            <div class="admin-list-info">
              <p class="admin-list-title">${escapeHtml(r.target_name || '—')} ${r.target_handle ? `· @${escapeHtml(r.target_handle)}` : ''}</p>
              <p class="admin-list-meta">${escapeHtml(t('admin.reportedBy'))}: ${escapeHtml(r.reporter_name || '?')}${r.reason ? ` · ${r.reason}` : ''}</p>
            </div>
            <button class="admin-delete-btn" data-action="resolve-user-report" data-id="${r.id}">${escapeHtml(t('admin.resolve'))}</button>
          </div>`).join('')}
    </div>`;
}

function renderAdminPosts() {
  const posts = state.adminPosts;
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('admin.recentPosts'))} (${posts ? posts.length : '…'})</h3>
      ${posts === null ? `<p class="empty-state">${escapeHtml(t('common.loading'))}</p>`
        : posts.length === 0 ? `<p class="empty-state">${escapeHtml(t('admin.noPosts'))}</p>`
        : posts.map((p) => `
          <div class="admin-list-item">
            <div class="admin-list-info">
              <p class="admin-list-title">${escapeHtml((p.text_content || '').slice(0, 60) || '—')}</p>
              <p class="admin-list-meta">${escapeHtml(p.business_name || '')} · ${p.target_feed} · ${timeAgo(p.created_at)}</p>
            </div>
            <button class="admin-delete-btn" data-action="delete-admin-post" data-id="${p.id}">${escapeHtml(t('common.delete'))}</button>
          </div>`).join('')}
    </div>`;
}

function renderAdminTools() {
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">${escapeHtml(t('admin.toolsTitle'))}</h3>
      <button class="settings-row" data-action="open-broadcast-push">${icon('bell', { size: 17 })} ${escapeHtml(t('admin.sendPush'))}</button>
      <button class="settings-row" data-action="admin-backfill-handles">${icon('edit', { size: 17 })} ${escapeHtml(t('admin.fillHandles'))}</button>
      <button class="settings-row" data-action="admin-seed-test">${icon('plus', { size: 17 })} ${escapeHtml(t('admin.seedTest'))}</button>
      <button class="settings-row" data-action="admin-cleanup-test" style="color:#B3273C">${icon('trash', { size: 17 })} ${escapeHtml(t('admin.cleanupTest'))}</button>
    </div>`;
}

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

async function suspendUser(id) {
  const reason = prompt('Důvod pozastavení (nepovinné):') || '';
  try {
    await apiPost(`/api/admin/users/${id}/suspend`, { reason });
    showToast(t('admin.suspended'));
    state.adminUsers = null;
    loadAdminUsers();
  } catch (err) { showToast(err.message); }
}

async function unsuspendUser(id) {
  try {
    await apiPost(`/api/admin/users/${id}/unsuspend`, {});
    showToast(t('admin.unsuspended'));
    state.adminUsers = null;
    loadAdminUsers();
  } catch (err) { showToast(err.message); }
}

function changeUserRole(id) {
  openModal({
    title: t('admin.changeRole'),
    body: `
      <div class="form-field">
        <label class="form-label">${escapeHtml(t('auth.registerRole'))}</label>
        <select class="form-select" name="role" required>
          <option value="user">${escapeHtml(t('admin.roleUser'))}</option>
          <option value="organization">${escapeHtml(t('admin.roleOrg'))}</option>
          <option value="hotelier">${escapeHtml(t('admin.roleHotelier'))}</option>
          <option value="admin">${escapeHtml(t('admin.roleAdmin'))}</option>
        </select>
      </div>`,
    submitLabel: t('common.save'),
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      try {
        await apiPost(`/api/admin/users/${id}/role`, { role: data.role });
        closeModal();
        showToast(t('admin.roleSaved'));
        state.adminUsers = null;
        loadAdminUsers();
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

function openUserDetail(id) {
  openModal({
    title: t('admin.userDetail'),
    body: `<div id="admin-user-detail-body" style="min-height:120px"><p style="color:var(--c-text-muted)">${escapeHtml(t('common.loading'))}</p></div>`,
    submitLabel: t('admin.close'),
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
          <div class="admin-stat-box"><div class="admin-stat-value">${d.stats.posts}</div><div class="admin-stat-label">${escapeHtml(t('stats.posts'))}</div></div>
          <div class="admin-stat-box"><div class="admin-stat-value">${d.stats.comments}</div><div class="admin-stat-label">${escapeHtml(t('stats.comments'))}</div></div>
          <div class="admin-stat-box"><div class="admin-stat-value">${d.stats.checkins}</div><div class="admin-stat-label">${escapeHtml(t('admin.checkinsCount'))}</div></div>
          <div class="admin-stat-box"><div class="admin-stat-value">${d.stats.followers}</div><div class="admin-stat-label">${escapeHtml(t('stats.followers'))}</div></div>
        </div>
        <p style="font-size:12px;color:var(--c-text-muted)">${escapeHtml(t('auth.registerRole'))}: <strong>${d.user.role}</strong> · Status: <strong>${d.user.status}</strong></p>
        <p style="font-size:12px;color:var(--c-text-muted)">${timeAgo(d.user.created_at)}</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">
          ${d.user.status === 'suspended'
            ? `<button class="profile-action-btn" data-action="admin-unsuspend-user" data-id="${id}">${escapeHtml(t('admin.unsuspend'))}</button>`
            : `<button class="profile-action-btn" style="color:#B3273C" data-action="admin-suspend-user" data-id="${id}">${escapeHtml(t('admin.suspend'))}</button>`}
          <button class="profile-action-btn" data-action="admin-change-role" data-id="${id}">${escapeHtml(t('admin.changeRole'))}</button>
          ${!d.user.email_verified ? `<button class="profile-action-btn" data-action="admin-force-verify-email" data-id="${id}">${escapeHtml(t('admin.forceVerify'))}</button>` : ''}
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<p style="color:#B3273C">${escapeHtml(t('common.error'))}: ${escapeHtml(err.message)}</p>`;
    }
  }, 100);
}

function openBroadcastPush() {
  openModal({
    title: t('admin.broadcastTitle'),
    body: `
      <div class="form-field"><label class="form-label">${escapeHtml(t('admin.broadcastTitleLbl'))}</label><input class="form-input" name="title" maxlength="100" required /></div>
      <div class="form-field"><label class="form-label">${escapeHtml(t('admin.broadcastMsg'))}</label><textarea class="form-textarea" name="message" maxlength="200" required></textarea></div>
      <div class="form-field"><label class="form-label">${escapeHtml(t('admin.broadcastUrl'))}</label><input class="form-input" name="url" placeholder="/?tab=events" /></div>`,
    submitLabel: t('admin.broadcastSend'),
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      try {
        const res = await apiPost('/api/admin/broadcast-push', data);
        closeModal();
        showToast(t('admin.broadcastSent', { sent: res.sent, total: res.users_targeted }));
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

async function verifyBusiness(kind, id) {
  try {
    await apiPost(`/api/admin/verify/${kind}/${id}`, {});
    showToast(t('admin.approved'));
    state.adminPending = null;
    state.adminPendingLoading = false;
    renderApp();
  } catch (err) { showToast(err.message); }
}

function deleteReportedPost(postId, reportId) {
  openModal({
    title: t('post.deleteTitle'),
    body: `<p style="font-size:14px;line-height:1.6">${escapeHtml(t('post.deleteText'))}</p>`,
    submitLabel: t('common.delete'),
    danger: true,
    onSubmit: async () => {
      state._modalLoading = true; renderApp();
      try {
        await apiDelete(`/api/admin/posts/${postId}`);
        closeModal();
        showToast(t('toasts.deleted'));
        state.adminReports = null;
        state.adminReportsLoading = false;
        renderApp();
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

function deleteAdminPost(postId) {
  openModal({
    title: t('post.deleteTitle'),
    body: `
      <p style="font-size:14px;line-height:1.6;margin-bottom:12px">${escapeHtml(t('post.deleteText'))}</p>
      <div class="form-field">
        <label class="form-label">Důvod (DSA — odešle se autorovi)</label>
        <textarea class="form-textarea" name="reason" rows="3" maxlength="500" placeholder="Porušenie pravidiel platformy"></textarea>
      </div>`,
    submitLabel: t('common.delete'),
    danger: true,
    onSubmit: async (data) => {
      state._modalLoading = true; renderApp();
      try {
        await apiDelete(`/api/admin/posts/${postId}`, { reason: data.reason || 'Porušenie pravidiel platformy' });
        closeModal();
        showToast(t('toasts.deleted'));
        state.adminPosts = null;
        renderApp();
      } catch (err) { showToast(err.message); state._modalLoading = false; renderApp(); }
    },
  });
}

async function approveVerification(id) {
  const note = prompt(t('admin.approveNote'), '') || '';
  try {
    await apiPost(`/api/admin/verifications/${id}/approve`, { note });
    showToast(t('admin.approved'));
    state.adminVerifications = null;
    renderApp();
  } catch (err) { showToast(err.message); }
}

async function rejectVerification(id) {
  const note = prompt(t('admin.rejectNote'), '') || '';
  try {
    await apiPost(`/api/admin/verifications/${id}/reject`, { note });
    showToast(t('admin.rejected'));
    state.adminVerifications = null;
    renderApp();
  } catch (err) { showToast(err.message); }
}

async function adminBackfillHandles() {
  if (!confirm(t('admin.handlesQuestion'))) return;
  try {
    const r = await apiPost('/api/admin/backfill-handles', {});
    showToast(t('admin.handlesDone', { updated: r.updated, total: r.total }));
  } catch (err) { showToast(err.message); }
}

async function adminSeedTest() {
  if (!confirm(t('admin.seedQuestion'))) return;
  try {
    const r = await apiPost('/api/admin/seed-test-content', {});
    showToast(t('admin.seedDone', { users: r.users || 0, businesses: r.businesses || 0, posts: r.posts || 0 }));
  } catch (err) { showToast(err.message); }
}

async function adminCleanupTest() {
  if (!confirm(t('admin.cleanupQuestion'))) return;
  try {
    await apiPost('/api/admin/cleanup-test-content', {});
    showToast(t('admin.cleanupDone'));
  } catch (err) { showToast(err.message); }
}

function openVerificationRequest(kind, id, name) {
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'verification-request', kind, id, name, docFile: null, uploading: false };
  pushHistoryState('overlay');
  renderApp();
}

function renderVerificationRequestOverlay() {
  const o = state.overlay;
  return `
    <div class="page-scroll">
      ${renderBackHeader(t('verify.title'))}
      <div class="profile-section">
        <p style="font-size:14px;line-height:1.6;margin-bottom:14px">
          ${escapeHtml(t('verify.text1'))} <strong>${escapeHtml(o.name)}</strong>.
        </p>
        <p style="font-size:12.5px;color:var(--c-text-muted);margin-bottom:14px">📄 ${escapeHtml(t('verify.text2'))}</p>
        <form data-action="submit-verification-request" data-kind="${o.kind}" data-id="${o.id}">
          <div class="file-drop ${o.docFile ? 'has-file' : ''}" data-action="trigger-verif-doc">
            <input type="file" accept="application/pdf,image/*" id="verif-doc-input" data-action="verif-doc-selected" style="display:none" />
            ${o.docFile ? `✓ ${escapeHtml(o.docFile.name)}` : `${icon('image', { size: 24 })}<br/>${escapeHtml(t('verify.pickDoc'))}`}
          </div>
          <div class="form-field">
            <label class="form-label">${escapeHtml(t('verify.note'))}</label>
            <textarea class="form-textarea" name="note" rows="3" maxlength="1000" placeholder="${escapeAttr(t('verify.notePh'))}"></textarea>
          </div>
          <button class="form-submit-btn" type="submit" ${o.uploading ? 'disabled' : ''}>
            ${o.uploading ? escapeHtml(t('common.sending')) : escapeHtml(t('verify.submit'))}
          </button>
        </form>
      </div>
    </div>`;
}

async function onVerifDocSelected(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast(t('verify.tooLarge')); return; }
  state.overlay = { ...state.overlay, docFile: file };
  renderApp();
}

async function handleVerificationSubmit(form) {
  const { kind, id, docFile } = state.overlay;
  if (!docFile) { showToast(t('verify.pickFile')); return; }
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

    showToast(t('toasts.verificationSent'));
    state.overlay = null;
    state._verificationStatus = undefined;
    renderApp();
  } catch (err) {
    showToast(err.message);
    state.overlay.uploading = false;
    renderApp();
  }
}

async function handlePushToggle(checked) {
  if (checked) await enablePushNotifications();
  else await disablePushNotifications();
}
