import Icon from './Icon';
import './BottomNav.css';

const tabs = [
  { key: 'org', icon: 'megaphone', label: 'Organizácie' },
  { key: 'collections', icon: 'map', label: 'Zbierky' },
  { key: 'profile', icon: 'users', label: 'Profil' },
];

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Hlavná navigácia">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`bottom-nav-btn ${active === tab.key ? 'is-active' : ''}`}
          onClick={() => onChange(tab.key)}
          aria-current={active === tab.key ? 'page' : undefined}
        >
          <Icon name={tab.icon} size={active === tab.key ? 22 : 20} />
          <span className="visually-hidden">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
