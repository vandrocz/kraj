const accountFormState = {
  registerRole: 'user',
  registerBusinessKind: 'accommodation',
  postTargetBusiness: null,
  postFiles: [],
  formError: '',
  formBusy: false,
};

function renderAccountPage() {
  if (!isLoggedIn()) {
    return `
      <div class="page-scroll">
        ${renderHeader('Můj účet')}
        ${renderAuthCard()}
      </div>`;
  }
  return `
    <div class="page-scroll">
      ${renderHeader('Můj účet', `
        <button class="header-icon-btn" data-action="open-notifications" style="position:relative" aria-label="Notifikace">
          ${icon('bell', { size: 19 })}
          ${state.unreadNotifications > 0 ? `<span class="nav-badge">${state.unreadNotifications > 9 ? '9+' : state.unreadNotifications}</span>` : ''}
        </button>
        <button class="header-icon-btn" data-action="open-threads" aria-label="Zprávy">${icon('chat', { size: 19 })}</button>
        <button class="header-icon-btn" data-action="open-search" aria-label="Hledat">${icon('search', { size: 19 })}</button>
        <button class="header-icon-btn" data-action="open-settings" aria-label="Nastavení">${icon('settings', { size: 19 })}</button>
      `)}
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
        <p class="verify-banner-text">Poslali jsme odkaz na <strong>${escapeHtml(state.user.email)}</strong>. Bez ověření nemůžeš přidávat příspěvky. <span style="color:var(--c-primary-dark);font-weight:700">Poslat znovu →</span></p>
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
      <div class="form-field"><label class="form-label">Zobrazované jméno</label><input class="form-input" name="displayName" required /></div>
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
      <select class="form-select" name="district" id="district-select-${prefix}" required>
        <option value="">Nejprve vyberte kraj</option>
      </select></div>
    <div class="form-field"><label class="form-label">Obec</label>
      <input class="form-input" name="city" required placeholder="např. Křivoklát" /></div>`;
}

function onRegionSelectChangeForDistrict(selectEl) {
  const region = selectEl.value;
  const districtSelect = selectEl.closest('form').querySelector('select[name="district"]');
  const options = REGIONS[region] || [];
  districtSelect.innerHTML = options.length
    ? `<option value="">Vyberte okres…</option>${options.map((d) => `<option value="${d}">${d}</option>`).join('')}`
    : `<option value="">Nejprve vyberte kraj</option>`;
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
    const data = await apiPost('/api/auth/login', { email: fd.get('email'), password: fd.get('password') });
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
  setToken(data.token); setStoredUser(data.user); setStoredBusinesses(data.businesses || []);
  state.token = data.token; state.user = data.user; state.businesses = data.businesses || [];
  state.wallet = null; state._twofaStage = null; state._twofaToken = null;
  showToast(`Vítej zpět, ${data.user.display_name}!`);
  loadWallet(); loadNotifications();
}

async function handleRegisterSubmit(form) {
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Vytvářím účet…'; }
  try {
    await apiPost('/api/auth/register', body);
    showToast('Účet vytvořen! Zkontroluj e-mail a ověř adresu.');
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
  clearToken(); clearStoredUser();
  state.token = null; state.user = null; state.businesses = [];
  state.wallet = null; state.adminPending = null; state.adminReports = null;
  state.overlay = null; state.unreadNotifications = 0;
  stopThreadPolling();
  showToast('Byl jsi odhlášen.');
  renderApp();
}

function renderAccountHeaderCard() {
  const initial = (state.user.display_name || state.user.email || '?').charAt(0).toUpperCase();
  const roleLabel = { user: 'Turista', organization: 'Organizace', hotelier: 'Podnik', admin: 'Administrátor' }[state.user.role] || state.user.role;
  const avatar = state.user.avatar_url
    ? `<img src="${state.user.avatar_url}" alt="" class="account-avatar" style="object-fit:cover" />`
    : `<div class="account-avatar">${initial}</div>`;
  return `
    <div class="account-header" data-action="open-profile" data-kind="user" data-id="${state.user.id}" style="cursor:pointer">
      ${avatar}
      <div style="flex:1"><p class="account-name">${escapeHtml(state.user.display_name)}</p><span class="account-role-chip">${roleLabel}</span></div>
      ${icon('chevronRight', { size: 18 })}
    </div>`;
}

function renderRoleSpecificContent() {
  if (state.user.role === 'user') return renderUserWalletSection();
  if (state.user.role === 'organization' || state.user.role === 'hotelier') return renderBusinessDashboard();
  if (state.user.role === 'admin') return renderAdminPanel();
  return '';
}

async function loadWallet() {
  try { state.wallet = await apiGet('/api/user/wallet'); }
  catch (err) { console.error('Wallet:', err.message); }
  finally { if (state.tab === 'account') renderApp(); }
}

function renderUserWalletSection() {
  const w = state.wallet;
  return `
    <div class="credit-card">
      <div class="credit-card-top"><div>
        <p class="credit-label">Tvůj kredit</p>
        <p class="credit-amount">${icon('wallet', { size: 20 })}${w ? fmt(w.credit_balance) : '…'}</p>
      </div></div>
      <p class="topup-label">Dobít kredit</p>
      <div class="topup-grid">
        ${[50, 150, 400, 1000].map((v) => `<button class="topup-chip" data-action="topup" data-amount="${v}">${v} Kč</button>`).join('')}
      </div>
    </div>
    <div class="profile-section">
      <h3 class="profile-section-title">Sbírky, kterým jsi pomohl</h3>
      ${w && w.contributions && w.contributions.length > 0
        ? w.contributions.map((c) => `
          <div class="contribution-row">
            <div><p class="contribution-title">${escapeHtml(c.title)}</p><p class="contribution-date">${timeAgo(c.created_at)}</p></div>
            <span class="contribution-amount">+${c.amount} Kč</span>
          </div>`).join('')
        : '<p class="empty-state">Zatím žádné příspěvky.</p>'}
    </div>`;
}

async function handleTopup(amount) {
  try {
    const data = await apiPost('/api/user/wallet/topup', { amount });
    if (state.wallet) state.wallet.credit_balance = data.credit_balance;
    showToast(`Kredit dobit o ${amount} Kč.`); renderApp();
  } catch (err) { showToast(err.message); }
}

function renderBusinessDashboard() {
  const businesses = state.businesses || [];
  if (businesses.length === 0) return '<p class="empty-state">K účtu není přiřazen žádný podnik.</p>';
  if (!accountFormState.postTargetBusiness) accountFormState.postTargetBusiness = businesses[0].id;
  const selected = businesses.find((b) => b.id === accountFormState.postTargetBusiness) || businesses[0];
  const targetFeed = selected.kind;

  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Tvůj podnik</h3>
      <div class="business-picker">
        ${businesses.map((b) => `<button class="business-chip ${b.id === selected.id ? 'is-selected' : ''}" data-action="select-business" data-id="${b.id}">${escapeHtml(b.name)} ${b.is_verified ? '✓' : ''}</button>`).join('')}
      </div>
      <div style="padding:0 16px 10px">
        <button class="profile-action-btn" data-action="open-profile" data-kind="${targetFeed}" data-id="${selected.id}">${icon('user', { size: 15 })} Zobrazit profil</button>
      </div>
      ${!selected.is_verified ? '<p class="form-hint" style="padding:0 16px 10px">Profil nemá odznak Ověřeno.</p>' : ''}
    </div>
    <div class="profile-section">
      <h3 class="profile-section-title">Přidat příspěvek (max. 4 fotky)</h3>
      <form data-action="submit-business-post" data-business-id="${selected.id}" data-target-feed="${targetFeed}">
        <div class="file-drop" data-action="trigger-file-input">
          <input type="file" name="file" accept="image/*" multiple style="display:none" id="post-file-input" data-action="files-selected" />
          <span id="file-drop-label">${icon('image', { size: 22 })}<br/>Klikni pro výběr 1–4 fotek</span>
        </div>
        <div id="file-preview-grid" class="file-preview-grid"></div>
        <div class="form-field"><label class="form-label">Text</label><textarea class="form-textarea" name="text" placeholder="Co je nového?"></textarea></div>
        <button class="form-submit-btn" type="submit">Zveřejnit</button>
        <p class="form-hint">Fotky se automaticky zmenší. Zveřejní se ihned.</p>
      </form>
    </div>`;
}

function selectBusiness(id) { accountFormState.postTargetBusiness = id; renderApp(); }

async function onFilesSelected(inputEl) {
  const files = Array.from(inputEl.files || []).slice(0, 4);
  if (files.length === 0) return;
  const label = document.getElementById('file-drop-label');
  const drop = inputEl.closest('.file-drop');
  const grid = document.getElementById('file-preview-grid');
  drop.classList.add('has-file');
  label.textContent = `Zpracovávám ${files.length}…`;
  const compressed = [];
  for (const f of files) compressed.push(await compressImage(f, { maxDim: 1600, quality: 0.82 }));
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
  fd.set('text', form.querySelector('textarea[name="text"]')?.value || '');
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Nahrávám…'; }
  try {
    await apiPost('/api/posts', fd);
    showToast('Příspěvek zveřejněn!');
    if (state.socialFeeds[targetFeed]) state.socialFeeds[targetFeed].items = [];
    accountFormState.postFiles = [];
    renderApp();
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Zveřejnit'; }
  }
}

// ---- Forgot / reset ----
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
  } catch (err) { showToast(err.message); if (btn) { btn.disabled = false; btn.textContent = 'Poslat odkaz'; } }
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
    state.overlay = null; state.authView = 'login'; renderApp();
  } catch (err) { showToast(err.message); }
}

async function resendVerification() {
  try { await apiPost('/api/auth/resend-verification', {}); showToast('Poslali jsme nový odkaz.'); }
  catch (err) { showToast(err.message); }
}

// ---- 2FA modal pri prihlásení ----
function renderTwoFAOverlay() {
  return `
    <div class="page-scroll">
      ${renderBackHeader('Dvoufázové ověření')}
      <div class="auth-card">
        <p style="font-size:13.5px;color:var(--c-text-muted);margin-bottom:16px;">Zadej 6místný kód z autentizační aplikace, nebo použij záložní kód.</p>
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

// ---- Admin ----
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
function renderAdminPanel() {
  if (state.adminPending === null && !state.adminPendingLoading) { state.adminPendingLoading = true; loadAdminPending(); }
  if (state.adminReports === null && !state.adminReportsLoading) { state.adminReportsLoading = true; loadAdminReports(); }
  const pending = state.adminPending;
  const items = pending ? [
    ...(pending.organizations || []).map((o) => ({ ...o, kind: 'organizations' })),
    ...(pending.accommodation || []).map((o) => ({ ...o, kind: 'accommodation' })),
    ...(pending.restaurants || []).map((o) => ({ ...o, kind: 'restaurants' })),
  ] : [];
  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Čekající na ověření (${pending ? items.length : '…'})</h3>
      ${pending === null ? '<p class="empty-state">Načítám…</p>'
        : items.length === 0 ? '<p class="empty-state">Žádné profily nečekají.</p>'
        : items.map((it) => `
          <div class="admin-list-item">
            <div class="admin-list-info"><p class="admin-list-title">${escapeHtml(it.name)}</p>
            <p class="admin-list-meta">${it.type} · ${it.city ? `${it.city}, ` : ''}${it.region}</p></div>
            <button class="admin-approve-btn" data-action="verify-business" data-kind="${it.kind}" data-id="${it.id}">Ověřit</button>
          </div>`).join('')}
    </div>
    <div class="profile-section">
      <h3 class="profile-section-title">Nahlášené příspěvky (${state.adminReports ? state.adminReports.length : '…'})</h3>
      ${state.adminReports === null ? '<p class="empty-state">Načítám…</p>'
        : state.adminReports.length === 0 ? '<p class="empty-state">Žádná nahlášení.</p>'
        : state.adminReports.map((r) => `
          <div class="admin-list-item">
            <div class="admin-list-info"><p class="admin-list-title">${(r.text_content || '').slice(0, 60) || '(bez textu)'}</p>
            <p class="admin-list-meta">Nahlásil: ${r.reporter_name || 'uživatel'}${r.reason ? ` · ${r.reason}` : ''}</p></div>
            <button class="admin-delete-btn" data-action="delete-reported-post" data-post-id="${r.post_id}" data-report-id="${r.id}">Smazat</button>
          </div>`).join('')}
    </div>`;
}
async function verifyBusiness(kind, id) {
  try { await apiPost(`/api/admin/verify/${kind}/${id}`, {}); showToast('Profil ověřen.'); state.adminPending = null; state.adminPendingLoading = false; renderApp(); }
  catch (err) { showToast(err.message); }
}
async function deleteReportedPost(postId, reportId) {
  if (!confirm('Skrýt tento příspěvek?')) return;
  try { await apiDelete(`/api/admin/posts/${postId}`); showToast('Odstraněno.'); state.adminReports = null; state.adminReportsLoading = false; renderApp(); }
  catch (err) { showToast(err.message); }
}
