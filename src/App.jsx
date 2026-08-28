import { useState } from 'react';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import CollectionsFeedPage from './pages/CollectionsFeedPage';
import OrganizationsFeedPage from './pages/OrganizationsFeedPage';
import ProfilePage from './pages/ProfilePage';

export default function App() {
  const [activeTab, setActiveTab] = useState('collections');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sidebarMode = activeTab === 'org' ? 'org' : 'user';

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} mode={sidebarMode} />

      {activeTab === 'org' && <OrganizationsFeedPage onMenuClick={() => setSidebarOpen(true)} />}
      {activeTab === 'collections' && <CollectionsFeedPage onMenuClick={() => setSidebarOpen(true)} />}
      {activeTab === 'profile' && <ProfilePage onMenuClick={() => setSidebarOpen(true)} />}

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
