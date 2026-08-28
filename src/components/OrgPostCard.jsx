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

export default function OrgPostCard({ post, onOpenLightbox }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [comments, setComments] = useState(post.comments);
  const [showComments, setShowComments] = useState(false);
  const [draft, setDraft] = useState('');

  function toggleLike() {
    setLiked((v) => !v);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  }

  function submitComment(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setComments((c) => [...c, { id: `tmp-${Date.now()}`, user: 'ty', text: draft.trim() }]);
    setDraft('');
  }

  return (
    <article className="post-card">
      {post.sponsored && <span className="post-badge" style={{ background: 'var(--c-gold)', boxShadow: 'none' }}>Partner</span>}

      <header className="post-card-head">
        <img src={post.org.avatar} alt="" className="post-avatar" />
        <div className="post-head-text">
          <p className="post-author">
            {post.org.name}
            {post.org.verified && <Icon name="check" size={13} className="verified-badge" />}
          </p>
          <p className="post-time">{timeAgo(post.createdAt)}</p>
        </div>
        <button className="post-more"><Icon name="more" size={18} /></button>
      </header>

      <button className="post-image-wrap" onClick={() => onOpenLightbox(post.image, post.caption)}>
        <img src={post.image} alt={post.caption} className="post-image" />
      </button>

      <div className="post-actions">
        <button className={`post-action ${liked ? 'is-liked' : ''}`} onClick={toggleLike}>
          <Icon name="heart" filled={liked} size={22} />
        </button>
        <button className="post-action" onClick={() => setShowComments((v) => !v)}>
          <Icon name="comment" size={21} />
        </button>
        <button className="post-action"><Icon name="share" size={21} /></button>
      </div>

      <div className="post-body">
        <p className="post-likes">{likeCount.toLocaleString('cs-CZ')} páči sa mi</p>
        <p className="post-caption"><strong>{post.org.name}</strong> {post.caption}</p>
        {!showComments && comments.length > 0 && (
          <button className="post-comments-link" onClick={() => setShowComments(true)}>
            Zobraziť všetkých {comments.length} komentárov
          </button>
        )}

        {showComments && (
          <div className="post-comments">
            {comments.map((c) => (
              <p className="post-comment-row" key={c.id}>
                <strong>{c.user}</strong>{c.text}
              </p>
            ))}
          </div>
        )}

        <form className="post-comment-form" onSubmit={submitComment}>
          <input
            className="post-comment-input"
            placeholder="Napíš komentár…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="post-comment-send">Odoslať</button>
        </form>
      </div>
    </article>
  );
}
