import { MenuButton } from './Sidebar';
import Icon from './Icon';
import './Header.css';

export default function Header({ title, onMenuClick, right }) {
  return (
    <header className="app-header">
      <MenuButton onClick={onMenuClick} />
      <h1 className="app-header-title">{title}</h1>
      <div className="app-header-right">
        {right || <button className="header-icon-btn"><Icon name="comment" size={19} /></button>}
      </div>
    </header>
  );
}
