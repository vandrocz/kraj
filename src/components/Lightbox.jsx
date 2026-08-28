import { useEffect } from 'react';
import Icon from './Icon';
import './Lightbox.css';

export default function Lightbox({ image, caption, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!image) return null;

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lightbox-close" onClick={onClose} aria-label="Zavrieť náhľad">
        <Icon name="close" size={22} />
      </button>
      <div className="lightbox-body" onClick={(e) => e.stopPropagation()}>
        <img src={image} alt={caption || ''} className="lightbox-img" />
        {caption && <p className="lightbox-caption">{caption}</p>}
      </div>
    </div>
  );
}
