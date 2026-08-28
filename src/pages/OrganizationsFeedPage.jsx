import { useState } from 'react';
import Header from '../components/Header';
import OrgPostCard from '../components/OrgPostCard';
import Lightbox from '../components/Lightbox';
import { organizationPosts } from '../data/mockData';

export default function OrganizationsFeedPage({ onMenuClick }) {
  const [lightbox, setLightbox] = useState(null);

  return (
    <div className="page-scroll">
      <Header title="Organizácie" onMenuClick={onMenuClick} />
      <div style={{ padding: '0 4px' }}>
        {organizationPosts.map((post) => (
          <OrgPostCard
            key={post.id}
            post={post}
            onOpenLightbox={(img, caption) => setLightbox({ img, caption })}
          />
        ))}
      </div>
      {lightbox && (
        <Lightbox image={lightbox.img} caption={lightbox.caption} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
