// ============================================================
// SEKCE 4: TURISTICKÉ SLUŽBY (Ubytování / Gastro)
// ============================================================

function renderServicesPage() {
  const activeKey = state.servicesTab; // 'accommodation' | 'gastro'
  const typeOptions = activeKey === 'accommodation' ? TYPES.accommodation : TYPES.restaurant;

  return `
    <div class="page-scroll">
      ${renderHeader('Služby')}
      <div class="section-tabs">
        <button class="section-tab ${activeKey === 'accommodation' ? 'is-active' : ''}" data-action="set-services-tab" data-services-tab="accommodation">
          ${icon('bed', { size: 16 })} Ubytování
        </button>
        <button class="section-tab ${activeKey === 'gastro' ? 'is-active' : ''}" data-action="set-services-tab" data-services-tab="gastro">
          ${icon('utensils', { size: 16 })} Gastro
        </button>
      </div>
      ${renderFilterBar(activeKey, typeOptions, activeKey === 'gastro')}
      ${renderSocialFeedBody(activeKey)}
    </div>
  `;
}

function setServicesTab(tab) {
  state.servicesTab = tab;
  renderApp();
  if (state.socialFeeds[tab].items.length === 0) loadSocialFeed(tab);
}
