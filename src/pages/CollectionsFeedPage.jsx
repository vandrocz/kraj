import { useState } from 'react';
import Header from '../components/Header';
import CollectionCard from '../components/CollectionCard';
import Lightbox from '../components/Lightbox';
import { collections } from '../data/mockData';

export default function CollectionsFeedPage({ onMenuClick }) {
  const [lightbox, setLightbox] = useState(null);
  const sorted = [...collections].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="page-scroll">
      <Header title="Zbierky" onMenuClick={onMenuClick} />
      <div style={{ padding: '0 4px' }}>
        {sorted.map((c) => (
          <CollectionCard
            key={c.id}
            collection={c}
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
