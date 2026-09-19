// ============================================================
// RECENZIE S HODNOTENÍM
// ============================================================

async function loadReviews(kind, id) {
  try {
    const data = await apiGet(`/api/reviews/business/${kind}/${id}`);
    state._reviews = data;
    if (isLoggedIn()) {
      try {
        const mine = await apiGet(`/api/reviews/me/${kind}/${id}`);
        state._myReview = mine.review || null;
      } catch { state._myReview = null; }
    }
  } catch { state._reviews = { reviews: [], summary: { total: 0, average: 0, distribution: {} } }; }
  if (state.overlay?.type === 'profile' && state._bizProfileTab === 'reviews') renderApp();
}

function renderStars(rating, size = 16) {
  const full = Math.round(rating);
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<span class="star ${i <= full ? 'is-full' : ''}">${i <= full ? '★' : '☆'}</span>`;
  }
  return `<span class="stars" style="font-size:${size}px">${out}</span>`;
}

function renderReviewsTab() {
  const d = state._reviews;
  if (!d) {
    return '<p class="empty-state">Načítám recenze…</p>';
  }
  const s = d.summary || { total: 0, average: 0, distribution: {} };
  const mine = state._myReview;

  return `
    <div class="profile-section">
      ${s.total > 0 ? `
        <div class="reviews-summary">
          <div class="reviews-avg">
            <div class="reviews-avg-num">${s.average.toFixed(1)}</div>
            ${renderStars(s.average, 18)}
            <p class="reviews-avg-count">${s.total} hodnocení</p>
          </div>
          <div class="reviews-dist">
            ${[5, 4, 3, 2, 1].map((r) => {
              const count = s.distribution[r] || 0;
              const pct = s.total > 0 ? Math.round((count / s.total) * 100) : 0;
              return `<div class="reviews-dist-row">
                <span class="reviews-dist-label">${r}★</span>
                <div class="reviews-dist-bar"><div style="width:${pct}%"></div></div>
                <span class="reviews-dist-count">${count}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      ` : '<p class="empty-state">Zatím žádné hodnocení.</p>'}

      ${isLoggedIn() ? `
        <button class="profile-action-btn" data-action="open-create-review" data-kind="${state.overlay.kind}" data-id="${state.overlay.id}" style="margin-top:16px;width:100%;justify-content:center">
          ${icon('comment', { size: 15 })} ${mine ? 'Upravit moje hodnocení' : 'Napsat hodnocení'}
        </button>
      ` : ''}

      ${mine ? `
        <div class="my-review-box">
          <p style="font-size:12px;color:var(--c-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px">Moje hodnocení</p>
          ${renderStars(mine.rating)}
          ${mine.title ? `<p style="font-weight:700;margin-top:6px">${escapeHtml(mine.title)}</p>` : ''}
          ${mine.text ? `<p style="font-size:13.5px;line-height:1.55;margin-top:4px">${escapeHtml(mine.text)}</p>` : ''}
        </div>
      ` : ''}

      ${d.reviews.length > 0 ? `
        <h3 class="profile-section-title" style="margin-top:20px">Všechny recenze (${d.reviews.length})</h3>
        ${d.reviews.map((r) => `
          <div class="review-item">
            <div class="review-head">
              <button data-action="open-profile" data-kind="user" data-id="${r.user_id}" style="display:flex;align-items:center;gap:10px;background:none;border:none;text-align:left;cursor:pointer">
                ${r.avatar_url ? `<img src="${r.avatar_url}" class="user-list-avatar" style="width:36px;height:36px" alt="" />`
                  : `<span class="user-list-avatar user-list-avatar-init" style="width:36px;height:36px;font-size:14px">${(r.display_name || '?').charAt(0).toUpperCase()}</span>`}
                <div>
                  <p style="font-weight:700;font-size:13.5px">${escapeHtml(r.display_name || '')}</p>
                  <p style="font-size:11.5px;color:var(--c-text-muted)">${timeAgo(r.created_at)}</p>
                </div>
              </button>
              <div>${renderStars(r.rating, 14)}</div>
            </div>
            ${r.title ? `<p style="font-weight:700;margin-top:8px;font-size:14px">${escapeHtml(r.title)}</p>` : ''}
            ${r.text ? `<p style="font-size:13.5px;line-height:1.55;margin-top:6px">${escapeHtml(r.text)}</p>` : ''}
          </div>
        `).join('')}
      ` : ''}
    </div>`;
}

function openCreateReview(kind, id) {
  if (!isLoggedIn()) { showToast('Pro hodnocení se musíš přihlásit.'); switchTab('account'); return; }
  state.overlayStack.push(state.overlay);
  state.overlay = { type: 'create-review', kind, id, rating: state._myReview?.rating || 5 };
  renderApp();
}

function renderCreateReviewOverlay() {
  const { kind, id, rating } = state.overlay;
  const mine = state._myReview;
  return `
    <div class="page-scroll">
      ${renderBackHeader(mine ? 'Upravit hodnocení' : 'Napsat hodnocení')}
      <div class="profile-section">
        <form data-action="submit-review" data-kind="${kind}" data-id="${id}">
          <div class="form-field">
            <label class="form-label">Hodnocení</label>
            <div class="rating-picker" data-rating="${rating}">
              ${[1, 2, 3, 4, 5].map((n) => `
                <button type="button" class="rating-star ${n <= rating ? 'is-active' : ''}" data-action="set-review-rating" data-value="${n}">★</button>
              `).join('')}
            </div>
            <input type="hidden" name="rating" value="${rating}" data-review-rating />
          </div>
          <div class="form-field">
            <label class="form-label">Nadpis (nepovinné)</label>
            <input class="form-input" name="title" maxlength="200" value="${escapeAttr(mine?.title || '')}" />
          </div>
          <div class="form-field">
            <label class="form-label">Recenze</label>
            <textarea class="form-textarea" name="text" rows="6" maxlength="3000" placeholder="Poděl se o svoje zkušenosti…">${escapeHtml(mine?.text || '')}</textarea>
          </div>
          <button class="form-submit-btn" type="submit">${mine ? 'Uložit' : 'Zveřejnit'}</button>
        </form>
      </div>
    </div>`;
}

async function handleReviewSubmit(form) {
  const kind = form.dataset.kind;
  const id = form.dataset.id;
  const fd = new FormData(form);
  const rating = parseInt(fd.get('rating'), 10);
  if (!rating || rating < 1 || rating > 5) { showToast('Vyber hodnocení.'); return; }
  const btn = form.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Ukládám…'; }

  try {
    const res = await apiPost('/api/reviews', {
      business_id: id,
      business_kind: kind,
      rating,
      title: fd.get('title') || null,
      text: fd.get('text') || null,
    });
    if (res.new_badges && res.new_badges.length > 0) {
      const list = res.new_badges.map((b) => `${b.name} L${b.level}`).join(', ');
      showToast(`Získáno: ${list}! 🎉`);
    } else {
      showToast(res.updated ? 'Hodnocení upraveno.' : 'Děkujeme za hodnocení!');
    }
    // Vráť sa na profil a reloadni reviews
    state.overlayStack.pop();
    state.overlay = state.overlayStack[state.overlayStack.length - 1] || null;
    state._reviews = null;
    state._myReview = null;
    if (state.overlay?.type === 'profile') {
      loadReviews(state.overlay.kind, state.overlay.id);
    }
    renderApp();
  } catch (err) {
    showToast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = mine ? 'Uložit' : 'Zveřejnit'; }
  }
}

function setReviewRating(value) {
  const picker = document.querySelector('.rating-picker');
  if (!picker) return;
  picker.dataset.rating = value;
  picker.querySelectorAll('.rating-star').forEach((s) => {
    s.classList.toggle('is-active', parseInt(s.dataset.value, 10) <= value);
  });
  const hidden = document.querySelector('[data-review-rating]');
  if (hidden) hidden.value = value;
}