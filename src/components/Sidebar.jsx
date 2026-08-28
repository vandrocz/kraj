import Icon from './Icon';
import { sidebarLinks, currentUser } from '../data/mockData';
import './Sidebar.css';

export function MenuButton({ onClick }) {
  return (
    <button className="menu-btn" onClick={onClick} aria-label="Otvoriť menu">
      <Icon name="menu" size={20} />
    </button>
  );
}

export default function Sidebar({ open, onClose, mode }) {
  const links = mode === 'org' ? sidebarLinks.org : sidebarLinks.user;

  return (
    <>
      <div
        className={`sidebar-scrim ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`sidebar-panel ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="sidebar-brand-mark">V</span>
            <span>Vandro</span>
          </div>
          <button className="sidebar-close" onClick={onClose} aria-label="Zavrieť menu">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="sidebar-profile">
          <img src={currentUser.avatar} alt="" className="sidebar-avatar" />
          <div>
            <p className="sidebar-name">{currentUser.name}</p>
            <p className="sidebar-handle">@{currentUser.username}</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {links.map((link) => (
            <button className="sidebar-link" key={link.label}>
              <Icon name={link.icon} size={19} />
              <span>{link.label}</span>
              <Icon name="chevronRight" size={16} className="sidebar-link-chevron" />
            </button>
          ))}
        </nav>

        <button className="sidebar-link sidebar-logout">
          <Icon name="logout" size={19} />
          <span>Odhlásiť sa</span>
        </button>
      </aside>
    </>
  );
}
