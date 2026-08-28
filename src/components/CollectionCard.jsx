import { useState } from 'react';
import Icon from './Icon';
import './PostCard.css';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'práve teraz';
  if (hours < 24) return `pred ${hours} h`;
  return `pred ${Math.floor(hours / 24)} d`;
}

export default function CollectionCard({ collection, onOpenLightbox }) {
  const [liked, setLiked] = useState(collection.liked);
  const [saved, setSaved] = useState(collection.saved);
  const [likeCount, setLikeCount] = useState(collection.likes);

  function toggleLike() {
    setLiked((v) => !v);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  }

  return (
    <article className="post-card">
      {collection.isNew && <span className="post-badge">Aktuálna</span>}

      <header className="post-card-head">
        <img src={collection.author.avatar} alt="" className="post-avatar" />
        <div className="post-head-text">
          <p className="post-author">
            {collection.author.name}
            {collection.author.verified && <Icon name="check" size={13} className="verified-badge" />}
          </p>
          <p className="post-time">{timeAgo(collection.createdAt)}</p>
        </div>
        <button className="post-more"><Icon name="more" size={18} /></button>
      </header>

      <button
        className="post-image-wrap"
        onClick={() => onOpenLightbox(collection.coverImage, collection.title)}
      >
        <img src={collection.coverImage} alt={collection.title} className="post-image" />
      </button>

      <div className="post-actions">
        <button className={`post-action ${liked ? 'is-liked' : ''}`} onClick={toggleLike}>
          <Icon name="heart" filled={liked} size={22} />
        </button>
        <button className="post-action"><Icon name="comment" size={21} /></button>
        <button className="post-action"><Icon name="share" size={21} /></button>
        <button className={`post-action post-save ${saved ? 'is-saved' : ''}`} onClick={() => setSaved((v) => !v)}>
          <Icon name={saved ? 'bookmarkFilled' : 'bookmark'} filled={saved} size={21} />
        </button>
      </div>

      <div className="post-body">
        <p className="post-likes">{likeCount.toLocaleString('cs-CZ')} páči sa mi</p>
        <p className="post-caption"><strong>{collection.title}</strong> — {collection.description}</p>
        {collection.comments > 0 && (
          <p className="post-comments-link">Zobraziť všetkých {collection.comments} komentárov</p>
        )}
      </div>
    </article>
  );
}
