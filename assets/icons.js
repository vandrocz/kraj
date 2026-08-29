const ICON_PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  home: 'M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9',
  bookmark: 'M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z',
  trophy: 'M8 4h8v4a4 4 0 0 1-8 0V4Z M5 6H4a2 2 0 0 0 2 2 M19 6h1a2 2 0 0 1-2 2 M9 15h6 M12 12v3 M9 20h6 M10 20v-2h4v2',
  wallet: 'M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z M4 7 6 4h9l2 3 M15 13h3',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z M4.5 12h1 M18.5 12h1 M12 4.5v1 M12 18.5v1 M6.5 6.5l.7.7 M16.8 16.8l.7.7 M17.5 6.5l-.7.7 M7.2 16.8l-.7.7',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 1.7-2 3.3 M12 16.5v.1',
  megaphone: 'M3 10v4a1 1 0 0 0 1 1h2l8 4V5L6 9H4a1 1 0 0 0-1 1Z M18 8a4 4 0 0 1 0 8',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M4 20h16',
  heart: 'M12 20.5s-7.5-4.6-9.7-9A5.5 5.5 0 0 1 12 6.2 5.5 5.5 0 0 1 21.7 11.5c-2.2 4.4-9.7 9-9.7 9Z',
  comment: 'M4 5h16v11H8l-4 4V5Z',
  share: 'M8 12h9 M13 7l5 5-5 5 M6 5v14',
  more: 'M6 12h.01 M12 12h.01 M18 12h.01',
  users: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M2 20c0-3 2.7-5 6-5s6 2 6 5 M17 8a2.5 2.5 0 1 0 0-5 M15.5 13c2.8.2 5 2 5 4.5',
  map: 'M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z M9 4v14 M15 6v14',
  coins: 'M9 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M6.5 15.5A5 5 0 0 0 15.5 19 5 5 0 0 0 20 11.8',
  check: 'M5 13l4 4 10-10',
  chevronRight: 'M9 6l6 6-6 6',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4 M16 17l5-5-5-5 M21 12H9',
};

function icon(name, { size = 22, strokeWidth = 1.8, filled = false, className = '' } = {}) {
  const d = ICON_PATHS[name] || ICON_PATHS.help;
  const paths = d.split(' M').map((seg, i) => (i === 0 ? seg : 'M' + seg))
    .map((seg) => `<path d="${seg}"/>`).join('');
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
