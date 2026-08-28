import { useState } from 'react';
import Header from '../components/Header';
import Icon from '../components/Icon';
import { currentUser } from '../data/mockData';
import './ProfilePage.css';

const topUpOptions = [50, 150, 400, 1000];

const shareTargets = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

export default function ProfilePage({ onMenuClick }) {
  const [selectedTopUp, setSelectedTopUp] = useState(150);
  const { stats } = currentUser;

  return (
    <div className="page-scroll">
      <Header
        title="Môj profil"
        onMenuClick={onMenuClick}
        right={<button className="header-icon-btn"><Icon name="settings" size={19} /></button>}
      />

      <section className="profile-hero">
        <img src={currentUser.avatar} alt="" className="profile-avatar" />
        <h2 className="profile-name">{currentUser.name}</h2>
        <p className="profile-handle">@{currentUser.username}</p>
        <p className="profile-bio">{currentUser.bio}</p>

        <div className="profile-stats-row">
          <div className="profile-stat">
            <strong>{stats.posts}</strong>
            <span>Príspevky</span>
          </div>
          <div className="profile-stat">
            <strong>{stats.followers}</strong>
            <span>Sledovatelia</span>
          </div>
          <div className="profile-stat">
            <strong>{stats.following}</strong>
            <span>Sleduje</span>
          </div>
          <div className="profile-stat">
            <strong>{stats.kmWalked}</strong>
            <span>km</span>
          </div>
        </div>
      </section>

      <section className="credit-card">
        <div className="credit-card-top">
          <div>
            <p className="credit-label">Tvoj kredit</p>
            <p className="credit-amount"><Icon name="coins" size={20} />{currentUser.credit}</p>
          </div>
          <button className="credit-history-btn">História</button>
        </div>

        <p className="topup-label">Dobiť kredit</p>
        <div className="topup-grid">
          {topUpOptions.map((v) => (
            <button
              key={v}
              className={`topup-chip ${selectedTopUp === v ? 'is-selected' : ''}`}
              onClick={() => setSelectedTopUp(v)}
            >
              {v} Kč
            </button>
          ))}
        </div>
        <button className="topup-confirm">Dobiť {selectedTopUp} Kč</button>
      </section>

      <section className="profile-section">
        <h3 className="profile-section-title">Štatistiky príspevkov</h3>
        <div className="stat-cards">
          <div className="stat-card">
            <p className="stat-card-value">{stats.collections}</p>
            <p className="stat-card-label">Vytvorené zbierky</p>
          </div>
          <div className="stat-card">
            <p className="stat-card-value">1 942</p>
            <p className="stat-card-label">Celkom páči sa mi</p>
          </div>
          <div className="stat-card">
            <p className="stat-card-value">86</p>
            <p className="stat-card-label">Komentáre</p>
          </div>
          <div className="stat-card">
            <p className="stat-card-value">312</p>
            <p className="stat-card-label">Zdieľania</p>
          </div>
        </div>
      </section>

      <section className="profile-section">
        <h3 className="profile-section-title">Zdieľať profil</h3>
        <div className="share-row">
          {shareTargets.map((t) => (
            <button key={t.key} className="share-chip">
              <Icon name="share" size={16} />
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="profile-section">
        <h3 className="profile-section-title">Nastavenia účtu</h3>
        <div className="settings-list">
          <button className="settings-row">
            <Icon name="settings" size={18} />
            <span>Upraviť profil</span>
            <Icon name="chevronRight" size={16} className="settings-chevron" />
          </button>
          <button className="settings-row">
            <Icon name="wallet" size={18} />
            <span>Platobné metódy</span>
            <Icon name="chevronRight" size={16} className="settings-chevron" />
          </button>
          <button className="settings-row">
            <Icon name="help" size={18} />
            <span>Súkromie a bezpečnosť</span>
            <Icon name="chevronRight" size={16} className="settings-chevron" />
          </button>
        </div>
      </section>
    </div>
  );
}
