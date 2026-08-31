const ICON_PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  home: 'M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9',
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z',
  wallet: 'M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z M4 7 6 4h9l2 3 M15 13h3',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z M4.5 12h1 M18.5 12h1 M12 4.5v1 M12 18.5v1 M6.5 6.5l.7.7 M16.8 16.8l.7.7 M17.5 6.5l-.7.7 M7.2 16.8l-.7.7',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 1.7-2 3.3 M12 16.5v.1',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M4 20h16',
  heart: 'M12 20.5s-7.5-4.6-9.7-9A5.5 5.5 0 0 1 12 6.2 5.5 5.5 0 0 1 21.7 11.5c-2.2 4.4-9.7 9-9.7 9Z',
  comment: 'M4 5h16v11H8l-4 4V5Z',
  share: 'M8 12h9 M13 7l5 5-5 5 M6 5v14',
  more: 'M6 12h.01 M12 12h.01 M18 12h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4.3-4.3',
  filter: 'M4 6h16 M7 12h10 M10 18h4',
  check: 'M5 13l4 4 10-10',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4 M16 17l5-5-5-5 M21 12H9',
  castle: 'M4 21V10l3-3v3h2V7l3-3 3 3v3h2V7l3 3v11H4Z M9 21v-4h6v4',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M15 9l-2 6-6 2 2-6 6-2Z',
  bed: 'M3 18v-6a2 2 0 0 1 2-2h2v3 M3 18h18 M21 18v-6a2 2 0 0 0-2-2h-8v5 M3 21v-3 M21 21v-3',
  utensils: 'M6 3v7a2 2 0 0 0 4 0V3 M8 10v11 M17 3c-1.5 0-3 1.5-3 4v4h3 M16.5 11V21',
  userCog: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M4 20c0-3 2.5-5 5.5-5 M17 14v1 M17 19v1 M13.5 16.5l.9.5 M19.6 20l.9.5 M13.5 20.5l.9-.5 M19.6 16.5l.9-.5 M19.5 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  cloud: 'M7 18a4 4 0 0 1-1-7.9 5 5 0 0 1 9.6-1.9A4.5 4.5 0 0 1 17 18H7Z',
  traffic: 'M9 3h6v3H9Z M9 18h6v3H9Z M8 6h8v12H8Z M11 9h.01 M11 15h.01',
  arrowLeft: 'M19 12H5M5 12l6-6M5 12l6 6',
  flag: 'M5 3v18 M5 4h11l-2 4 2 4H5',
  image: 'M4 5h16v14H4Z M8 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M20 16l-5-5-4 4-2-2-5 5',
};

function icon(name, { size = 22, strokeWidth = 1.8, filled = false, className = '' } = {}) {
  const d = ICON_PATHS[name] || ICON_PATHS.help;
  const paths = d.split(' M').map((seg, i) => (i === 0 ? seg : 'M' + seg))
    .map((seg) => `<path d="${seg}"/>`).join('');
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
