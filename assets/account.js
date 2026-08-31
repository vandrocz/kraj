// ============================================================
// SEKCE 5: MŮJ ÚČET
// ============================================================

// Doplnkový stav len pre formuláre (nepatrí do hlavného `state`, lebo sa nemá ukladať)
const accountFormState = {
  registerRole: 'user',            // 'user' | 'organization' | 'hotelier'
  registerBusinessKind: 'accommodation', // 'accommodation' | 'gastro' (len pre hotelier)
  postTargetBusiness: null,        // vybraný podnik pri pridávaní príspevku
  formError: '',
  formBusy: false,
};

function renderAccountPage() {
  if (!isLoggedIn()) {
    return `
      <div class="page-scroll">
        ${renderHeader('Můj účet')}
        ${renderAuthCard()}
      </div>
    `;
  }
  return `
    <div class="page-scroll">
      ${renderHeader('Můj účet', `<button class="account-logout-btn" data-action="logout">${icon('logout', { size: 15 })} Odhlásit</button>`)}
      ${renderAccountHeaderCard()}
      ${renderRoleSpecificContent()}
    </div>
  `;
}

// ---------------- PRIHLÁSENIE / REGISTRÁCIA ----------------

function renderAuthCard() {
  return `
    <div class="auth-card">
      <div class="auth-tabs">
        <button class="auth-tab ${state.authView === 'login' ? 'is-active' : ''}" data-action="set-auth-view" data-view="login">Přihlásit se</button>
        <button class="auth-tab ${state.authView === 'register' ? 'is-active' : ''}" data-action="set-auth-view" data-view="register">Registrace</button>
      </div>
      ${accountFormState.formError ? `<div class="form-error">${accountFormState.formError}</div>` : ''}
      ${state.authView === 'login' ? renderLoginForm() : renderRegisterForm()}
    </div>
  `;
}

function renderLoginForm() {
  return `
    <form data-action="submit-login">
      <div class="form-field">
        <label class="form-label">E-mail</label>
        <input class="form-input" type="email" name="email" required autocomplete="email" />
      </div>
      <div class="form-field">
        <label class="form-label">Heslo</label>
        <input class="form-input" type="password" name="password" required autocomplete="current-password" />
      </div>
      <button class="form-submit-btn" type="submit" ${accountFormState.formBusy ? 'disabled' : ''}>
        ${accountFormState.formBusy ? 'Přihlašuji…' : 'Přihlásit se'}
      </button>
    </form>
  `;
}

function renderRegisterForm() {
  const role = accountFormState.registerRole;
  const kind = accountFormState.registerBusinessKind;

  const roleFields = role === 'organization' ? `
    <div class="form-field">
      <label class="form-label">Název organizace</label>
      <input class="form-input" name="orgName" required />
    </div>
    <div class="form-field">
      <label class="form-label">Druh</label>
      <select class="form-select" name="orgType" required>
        ${TYPES.organization.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
      </select>
    </div>
    ${renderRegionDistrictFields('reg')}
    <div class="form-field">
      <label class="form-label">Popis</label>
      <textarea class="form-textarea" name="description" placeholder="Krátký popis pro veřejný profil"></textarea>
    </div>
  ` : role === 'hotelier' ? `
    <div class="form-role-grid" style="grid-template-columns:repeat(2,1fr)">
      <button type="button" class="form-role-btn ${kind === 'accommodation' ? 'is-selected' : ''}" data-action="set-business-kind" data-kind="accommodation">Ubytování</button>
      <button type="button" class="form-role-btn ${kind === 'gastro' ? 'is-selected' : ''}" data-action="set-business-kind" data-kind="gastro">Gastro</button>
    </div>
    <input type="hidden" name="businessKind" value="${kind}" />
    <div class="form-field">
      <label class="form-label">Název podniku</label>
      <input class="form-input" name="businessName" required />
    </div>
    <div class="form-field">
      <label class="form-label">Typ</label>
      <select class="form-select" name="businessType" required>
        ${(kind === 'accommodation' ? TYPES.accommodation : TYPES.restaurant).map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
      </select>
    </div>
    ${kind === 'gastro' ? `
      <div class="form-field">
        <label class="form-label">Typ kuchyně</label>
        <select class="form-select" name="cuisineType">
          ${TYPES.cuisine.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
      </div>
    ` : `
      <div class="form-field">
        <label class="form-label">Kapacita (počet lůžek)</label>
        <input class="form-input" type="number" name="capacity" min="1" />
      </div>
    `}
    ${renderRegionDistrictFields('reg')}
    <div class="form-field">
      <label class="form-label">Popis</label>
      <textarea class="form-textarea" name="description" placeholder="Krátký popis pro veřejný profil"></textarea>
    </div>
  ` : '';

  return `
    <form data-action="submit-register">
      <label class="form-label">Typ účtu</label>
      <div class="form-role-grid">
        <button type="button" class="form-role-btn ${role === 'user' ? 'is-selected' : ''}" data-action="set-register-role" data-role="user">Turista</button>
        <button type="button" class="form-role-btn ${role === 'organization' ? 'is-selected' : ''}" data-action="set-register-role" data-role="organization">Organizace</button>
        <button type="button" class="form-role-btn ${role === 'hotelier' ? 'is-selected' : ''}" data-action="set-register-role" data-role="hotelier">Ubytování / Gastro</button>
      </div>
      <input type="hidden" name="role" value="${role}" />

      <div class="form-field">
        <label class="form-label">Zobrazované jméno</label>
        <input class="form-input" name="displayName" required />
      </div>
      <div class="form-field">
        <label class="form-label">E-mail</label>
        <input class="form-input" type="email" name="email" required autocomplete="email" />
      </div>
      <div class="form-field">
        <label class="form-label">Heslo</label>
        <input class="form-input" type="password" name="password" required minlength="6" autocomplete="new-password" />
        <p class="form-hint">Alespoň 6 znaků.</p>
      </div>

      ${roleFields}

      <button class="form-submit-btn" type="submit" ${accountFormState.formBusy ? 'disabled' : ''}>
        ${accountFormState.formBusy ? 'Vytvářím účet…' : 'Vytvořit účet'}
      </button>
    </form>
  `;
}

function renderRegionDistrictFields(prefix) {
  return `
    <div class="form-field">
      <label class="form-label">Kraj</label>
      <select class="form-select" name="region" data-action="region-select-change" required>
        <option value="">Vyberte kraj…</option>
        ${Object.keys(REGIONS).map((r) => `<option value="${r}">${r}</option>`).join('')}
      </select>
    </div>
    <div class="form-field">
      <label class="form-label">Okres</label>
      <select class="form-select" name="district" id="district-select-${prefix}" required>
        <option value="">Nejprve vyberte kraj</option>
      </select>
    </div>
  `;
}

function onRegionSelectChangeForDistrict(selectEl) {
  const region = selectEl.value;
  const districtSelect = selectEl.closest('form').querySelector('select[name="district"]');
  const options = REGIONS[region] || [];
  districtSelect.innerHTML = options.length
    ? `<option value="">Vyberte okres…</option>${options.map((d) => `<option value="${d}">${d}</option>`).join('')}`
    : `<option value="">Nejprve vyberte kraj</option>`;
}

async function handleLoginSubmit(form) {
  const fd = new FormData(form);
  accountFormState.formError = '';
  accountFormState.formBusy = true;
  renderApp();
  try {
    const data = await apiPost('/api/auth/login', { email: fd.get('email'), password: fd.get('password') });
    setToken(data.token);
    setStoredUser(data.user);
    setStoredBusinesses(data.businesses || []);
    state.token = data.token;
    state.user = data.user;
    state.businesses = data.businesses || [];
    showToast(`Vítej zpět, ${data.user.display_name}!`);
    loadWallet();
  } catch (err) {
    accountFormState.formError = err.message;
  } finally {
    accountFormState.formBusy = false;
    renderApp();
  }
}

async function handleRegisterSubmit(form) {
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  accountFormState.formError = '';
  accountFormState.formBusy = true;
  renderApp();
  try {
    await apiPost('/api/auth/register', body);
    showToast('Účet vytvořen! Nyní se přihlas.');
    state.authView = 'login';
  } catch (err) {
    accountFormState.formError = err.message;
  } finally {
    accountFormState.formBusy = false;
    renderApp();
  }
}

function handleLogout() {
  apiPost('/api/auth/logout', {}).catch(() => {});
  clearToken();
  clearStoredUser();
  state.token = null;
  state.user = null;
  state.businesses = [];
  state.wallet = null;
  showToast('Byl jsi odhlášen.');
  renderApp();
}

// ---------------- HLAVIČKA ÚČTU + OBSAH PODĽA ROLE ----------------

function renderAccountHeaderCard() {
  const initials = (state.user.display_name || state.user.email || '?').charAt(0).toUpperCase();
  const roleLabel = { user: 'Turista', organization: 'Organizace', hotelier: 'Ubytování / Gastro', admin: 'Administrátor' }[state.user.role] || state.user.role;
  return `
    <div class="account-header">
      <div class="account-avatar">${initials}</div>
      <div>
        <p class="account-name">${state.user.display_name}</p>
        <span class="account-role-chip">${roleLabel}</span>
      </div>
    </div>
  `;
}

function renderRoleSpecificContent() {
  if (state.user.role === 'user') return renderUserWalletSection();
  if (state.user.role === 'organization' || state.user.role === 'hotelier') return renderBusinessDashboard();
  if (state.user.role === 'admin') return renderAdminPanel();
  return '';
}

// ---------------- ROLA: USER (peňaženka) ----------------

async function loadWallet() {
  try {
    state.wallet = await apiGet('/api/user/wallet');
  } catch (err) {
    console.error('Wallet load failed:', err.message);
  } finally {
    if (state.tab === 'account') renderApp();
  }
}

function renderUserWalletSection() {
  const w = state.wallet;
  return `
    <div class="credit-card">
      <div class="credit-card-top">
        <div>
          <p class="credit-label">Tvůj kredit</p>
          <p class="credit-amount">${icon('wallet', { size: 20 })}${w ? fmt(w.credit_balance) : '…'}</p>
        </div>
      </div>
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
            <div>
              <p class="contribution-title">${c.title}</p>
              <p class="contribution-date">${timeAgo(c.created_at)}</p>
            </div>
            <span class="contribution-amount">+${c.amount} Kč</span>
          </div>
        `).join('')
        : '<p class="empty-state">Zatím žádné příspěvky — tvá první koruna půjde na sbírku už zítra ráno.</p>'}
    </div>
  `;
}

async function handleTopup(amount) {
  try {
    const data = await apiPost('/api/user/wallet/topup', { amount });
    if (state.wallet) state.wallet.credit_balance = data.credit_balance;
    showToast(`Kredit dobit o ${amount} Kč.`);
    renderApp();
  } catch (err) {
    showToast(err.message);
  }
}

// ---------------- ROLA: ORGANIZATION / HOTELIER (správa profilu + pridanie príspevku) ----------------

function renderBusinessDashboard() {
  const businesses = state.businesses || [];
  if (businesses.length === 0) {
    return '<p class="empty-state">K tvému účtu není přiřazený žádný podnik.</p>';
  }
  if (!accountFormState.postTargetBusiness) accountFormState.postTargetBusiness = businesses[0].id;
  const selected = businesses.find((b) => b.id === accountFormState.postTargetBusiness) || businesses[0];
  const targetFeed = selected.kind; // 'organization' | 'accommodation' | 'gastro'

  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Tvůj podnik</h3>
      <div class="business-picker">
        ${businesses.map((b) => `
          <button class="business-chip ${b.id === selected.id ? 'is-selected' : ''}" data-action="select-business" data-id="${b.id}">
            ${b.name} ${b.is_verified ? '✓' : ''}
          </button>
        `).join('')}
      </div>
      ${!selected.is_verified ? '<p class="form-hint" style="padding:0 16px 10px">Profil zatím nemá odznak Ověřeno — o ten rozhoduje administrátor.</p>' : ''}
    </div>

    <div class="profile-section">
      <h3 class="profile-section-title">Přidat příspěvek do feedu</h3>
      <form data-action="submit-business-post" data-business-id="${selected.id}" data-target-feed="${targetFeed}">
        <div class="file-drop" data-action="trigger-file-input">
          <input type="file" name="file" accept="image/*" required style="display:none" id="post-file-input" data-action="file-selected" />
          <span id="file-drop-label">${icon('image', { size: 22 })}<br/>Klikni pro výběr fotky</span>
        </div>
        <div class="form-field">
          <label class="form-label">Text příspěvku</label>
          <textarea class="form-textarea" name="text" placeholder="Co je nového?" required></textarea>
        </div>
        <button class="form-submit-btn" type="submit" ${accountFormState.formBusy ? 'disabled' : ''}>
          ${accountFormState.formBusy ? 'Nahrávám…' : 'Zveřejnit ihned'}
        </button>
        <p class="form-hint">Příspěvek se zveřejní okamžitě bez schvalování administrátorem.</p>
      </form>
    </div>
  `;
}

function selectBusiness(id) {
  accountFormState.postTargetBusiness = id;
  renderApp();
}

function onFileSelected(inputEl) {
  const label = document.getElementById('file-drop-label');
  const drop = inputEl.closest('.file-drop');
  if (inputEl.files && inputEl.files[0]) {
    label.textContent = `✓ ${inputEl.files[0].name}`;
    drop.classList.add('has-file');
  }
}

async function handleBusinessPostSubmit(form) {
  const businessId = form.dataset.businessId;
  const targetFeed = form.dataset.targetFeed;
  const fd = new FormData(form);
  fd.set('business_id', businessId);
  fd.set('target_feed', targetFeed);

  accountFormState.formBusy = true;
  renderApp();
  try {
    await apiPost('/api/posts', fd);
    showToast('Příspěvek zveřejněn!');
    if (state.socialFeeds[targetFeed]) state.socialFeeds[targetFeed].items = [];
  } catch (err) {
    showToast(err.message);
  } finally {
    accountFormState.formBusy = false;
    renderApp();
  }
}

// ---------------- ROLA: ADMIN ----------------

async function loadAdminPending() {
  try {
    state.adminPending = await apiGet('/api/admin/pending');
  } catch (err) {
    showToast('Nepodařilo se načíst čekající profily.');
  }
  if (state.tab === 'account') renderApp();
}

async function loadAdminReports() {
  try {
    const data = await apiGet('/api/admin/reports');
    state.adminReports = data.reports;
  } catch (err) {
    showToast('Nepodařilo se načíst nahlášení.');
  }
  if (state.tab === 'account') renderApp();
}

function renderAdminPanel() {
  if (!state.adminPending) loadAdminPending();
  if (!state.adminReports) loadAdminReports();

  const pending = state.adminPending;
  const pendingItems = pending
    ? [
        ...pending.organizations.map((o) => ({ ...o, kind: 'organizations' })),
        ...pending.accommodation.map((o) => ({ ...o, kind: 'accommodation' })),
        ...pending.restaurants.map((o) => ({ ...o, kind: 'restaurants' })),
      ]
    : [];

  return `
    <div class="profile-section">
      <h3 class="profile-section-title">Čekající na ověření (${pendingItems.length})</h3>
      ${pendingItems.length === 0
        ? '<p class="empty-state">Žádné profily nečekají na schválení.</p>'
        : pendingItems.map((item) => `
          <div class="admin-list-item">
            <div class="admin-list-info">
              <p class="admin-list-title">${item.name}</p>
              <p class="admin-list-meta">${item.type} · ${item.region}, ${item.district}</p>
            </div>
            <button class="admin-approve-btn" data-action="verify-business" data-kind="${item.kind}" data-id="${item.id}">Ověřit</button>
          </div>
        `).join('')}
    </div>

    <div class="profile-section">
      <h3 class="profile-section-title">Nahlášené příspěvky (${state.adminReports ? state.adminReports.length : '…'})</h3>
      ${state.adminReports && state.adminReports.length === 0
        ? '<p class="empty-state">Žádná nevyřízená nahlášení.</p>'
        : (state.adminReports || []).map((r) => `
          <div class="admin-list-item">
            <div class="admin-list-info">
              <p class="admin-list-title">${(r.text_content || '').slice(0, 60) || '(bez textu)'}</p>
              <p class="admin-list-meta">Nahlásil: ${r.reporter_name || 'uživatel'} · Feed: ${r.target_feed}${r.reason ? ` · Důvod: ${r.reason}` : ''}</p>
            </div>
            <button class="admin-delete-btn" data-action="delete-reported-post" data-post-id="${r.post_id}" data-report-id="${r.id}">Smazat</button>
          </div>
        `).join('')}
    </div>
  `;
}

async function verifyBusiness(kind, id) {
  try {
    await apiPost(`/api/admin/verify/${kind}/${id}`, {});
    showToast('Profil byl ověřen.');
    state.adminPending = null;
    loadAdminPending();
  } catch (err) {
    showToast(err.message);
  }
}

async function deleteReportedPost(postId, reportId) {
  if (!confirm('Opravdu chceš tento příspěvek trvale skrýt?')) return;
  try {
    await apiDelete(`/api/admin/posts/${postId}`);
    showToast('Příspěvek byl odstraněn.');
    state.adminReports = null;
    loadAdminReports();
  } catch (err) {
    showToast(err.message);
  }
}
