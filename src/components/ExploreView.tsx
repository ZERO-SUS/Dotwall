import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  ExternalLink,
  Flag,
  Heart,
  MessageSquare,
  Search,
  Share2,
  Shuffle,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type {
  CommunityArtwork,
  CommunityComment,
  PixelTask,
  PlayerProfile,
} from '../types';
import { PixelArtworkPreview } from './PixelArtworkPreview';
import { exportSpritePng } from '../utils/exportPng';

interface ExploreViewProps {
  artworks: CommunityArtwork[];
  tasks: PixelTask[];
  comments: CommunityComment[];
  currentUser: PlayerProfile | null;
  selectedArtwork: CommunityArtwork | null;
  onSelectArtwork: (art: CommunityArtwork | null) => void;
  onToggleLike: (artworkId: string) => Promise<void>;
  onPostComment: (payload: {
    artworkId: string | null;
    parentId?: string | null;
    content: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onReportComment: (commentId: string, reason: string) => Promise<void>;
  onInspectPlayer: (username: string) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  artworks,
  tasks,
  comments,
  currentUser,
  selectedArtwork,
  onSelectArtwork,
  onToggleLike,
  onPostComment,
  onReportComment,
  onInspectPlayer,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortMode, setSortMode] = useState<'trending' | 'popular' | 'recent'>('trending');
  const [randomReferenceIndex, setRandomReferenceIndex] = useState<number>(0);

  // Detail modal comment input
  const [commentText, setCommentText] = useState<string>('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>(['All']);
    artworks.forEach((a) => set.add(a.category));
    tasks.forEach((t) => set.add(t.category));
    return Array.from(set);
  }, [artworks, tasks]);

  const filteredArtworks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = artworks.filter((art) => {
      if (selectedCategory !== 'All' && art.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        art.title.toLowerCase().includes(q) ||
        art.creatorUsername.toLowerCase().includes(q) ||
        art.description.toLowerCase().includes(q) ||
        art.category.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'popular') {
        return b.likes.length - a.likes.length;
      }
      if (sortMode === 'recent') {
        return b.createdAt - a.createdAt;
      }
      // Trending: combination of likes, comments, and recency
      const scoreA = a.likes.length * 3 + a.commentsCount * 4 - (Date.now() - a.createdAt) / 36000000;
      const scoreB = b.likes.length * 3 + b.commentsCount * 4 - (Date.now() - b.createdAt) / 36000000;
      return scoreB - scoreA;
    });
  }, [artworks, searchQuery, selectedCategory, sortMode]);

  const randomReferenceTask = useMemo(
    () => tasks[randomReferenceIndex % Math.max(1, tasks.length)] || tasks[0],
    [tasks, randomReferenceIndex]
  );

  const handleOpenRandomArtwork = () => {
    if (artworks.length === 0) return;
    const pick = artworks[Math.floor(Math.random() * artworks.length)];
    onSelectArtwork(pick);
  };

  const activeDetailArtwork = useMemo(() => {
    if (!selectedArtwork) return null;
    return artworks.find((a) => a.id === selectedArtwork.id) || selectedArtwork;
  }, [artworks, selectedArtwork]);

  const activeArtworkComments = useMemo(() => {
    if (!activeDetailArtwork) return [];
    return comments.filter((c) => c.artworkId === activeDetailArtwork.id && !c.hidden);
  }, [comments, activeDetailArtwork]);

  const handleDetailCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDetailArtwork || !commentText.trim()) return;
    setCommentError(null);
    const res = await onPostComment({
      artworkId: activeDetailArtwork.id,
      content: commentText,
    });
    if (res.ok) {
      setCommentText('');
    } else {
      setCommentError(res.error || 'Could not post comment.');
    }
  };

  return (
    <div className="view-section">
      {/* Hero & Random Artwork Generator */}
      <div className="section-hero-card">
        <div>
          <span className="eyebrow">EXPLORE GALLERY · COMMUNITY PIXEL ARCHIVE</span>
          <h1 className="view-title">Discover Global Pixel Creations</h1>
          <p className="lede">
            Browse community-submitted sprites, trending challenge winners, and random pixel-art
            reference inspiration. Export any piece as a crisp high-res PNG.
          </p>
        </div>
        <div className="task-hero-actions">
          <button type="button" className="btn primary" onClick={handleOpenRandomArtwork}>
            <Shuffle size={16} /> Random Artwork
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setRandomReferenceIndex((i) => i + 1)}
          >
            <Sparkles size={16} /> Roll Reference Sprite
          </button>
        </div>
      </div>

      {/* Random Pixel-Art Reference Inspiration Spotlight */}
      {randomReferenceTask && (
        <div className="card reference-spotlight-banner">
          <div className="ref-spotlight-left">
            <div className="ref-spotlight-thumb">
              <PixelArtworkPreview
                pixels={randomReferenceTask.referencePixels}
                gridSize={randomReferenceTask.gridSize}
                size={88}
                backgroundColor="#18171F"
              />
            </div>
            <div>
              <span className="genz-pill accent">RANDOM REFERENCE IDEA</span>
              <h3 style={{ margin: '6px 0 2px', font: '700 18px var(--font-display)' }}>
                {randomReferenceTask.title}
              </h3>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                {randomReferenceTask.description}
              </p>
            </div>
          </div>
          <div className="ref-spotlight-actions">
            <button
              type="button"
              className="tbtn"
              onClick={() => setRandomReferenceIndex((i) => i + 1)}
            >
              <Shuffle size={13} /> Next Reference
            </button>
            <button
              type="button"
              className="tbtn"
              onClick={() =>
                exportSpritePng({
                  pixels: randomReferenceTask.referencePixels,
                  gridSize: randomReferenceTask.gridSize,
                  filename: `reference-${randomReferenceTask.id}`,
                })
              }
            >
              <Download size={13} /> Save Reference PNG
            </button>
          </div>
        </div>
      )}

      {/* Search, Sort & Category Filter Bar */}
      <div className="explore-controls-bar">
        <div className="search-input-wrap">
          <Search size={15} />
          <input
            type="search"
            placeholder="Search artwork titles, @creators, or categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="seg">
          <button
            type="button"
            aria-pressed={sortMode === 'trending'}
            onClick={() => setSortMode('trending')}
          >
            🔥 Trending
          </button>
          <button
            type="button"
            aria-pressed={sortMode === 'popular'}
            onClick={() => setSortMode('popular')}
          >
            💜 Most Popular
          </button>
          <button
            type="button"
            aria-pressed={sortMode === 'recent'}
            onClick={() => setSortMode('recent')}
          >
            ✨ Recently Submitted
          </button>
        </div>
      </div>

      {/* Category Pills */}
      <div className="category-pills-row">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Artworks Grid */}
      {filteredArtworks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="empty-line">No artworks match your filter. Try clearing the search query!</p>
        </div>
      ) : (
        <div className="explore-grid">
          {filteredArtworks.map((art) => {
            const isLiked = currentUser ? art.likes.includes(currentUser.id) : false;
            return (
              <article key={art.id} className="card artwork-card">
                <div
                  className="artwork-card-preview"
                  onClick={() => onSelectArtwork(art)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelectArtwork(art);
                  }}
                >
                  <PixelArtworkPreview
                    pixels={art.pixels}
                    gridSize={art.gridSize}
                    size={220}
                    backgroundColor="#18171F"
                  />
                  <span className="artwork-category-tag">{art.category}</span>
                </div>

                <div className="artwork-card-body">
                  <h3 className="artwork-title" onClick={() => onSelectArtwork(art)}>
                    {art.title}
                  </h3>
                  <p className="artwork-desc">{art.description}</p>

                  <div className="artwork-creator-row">
                    <button
                      type="button"
                      className="creator-chip"
                      onClick={() => onInspectPlayer(art.creatorUsername)}
                    >
                      <span
                        className="creator-avatar-dot"
                        style={{ backgroundColor: art.creatorColor }}
                      >
                        {art.creatorAvatar}
                      </span>
                      <span>@{art.creatorUsername}</span>
                    </button>
                    <span className="artwork-date">
                      {new Date(art.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="artwork-actions-row">
                    <button
                      type="button"
                      className={`art-act-btn ${isLiked ? 'liked' : ''}`}
                      onClick={() => onToggleLike(art.id)}
                    >
                      <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
                      <span>{art.likes.length}</span>
                    </button>

                    <button
                      type="button"
                      className="art-act-btn"
                      onClick={() => onSelectArtwork(art)}
                    >
                      <MessageSquare size={14} />
                      <span>{art.commentsCount}</span>
                    </button>

                    <button
                      type="button"
                      className="art-act-btn"
                      onClick={() =>
                        exportSpritePng({
                          pixels: art.pixels,
                          gridSize: art.gridSize,
                          filename: art.title,
                        })
                      }
                      title="Download high-res PNG"
                    >
                      <Download size={14} />
                      <span>PNG</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ARTWORK DETAIL MODAL */}
      {activeDetailArtwork && (
        <div
          className="modal-backdrop"
          onClick={() => onSelectArtwork(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card artwork-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="genz-pill accent">{activeDetailArtwork.category}</span>
                <h2 className="modal-title">{activeDetailArtwork.title}</h2>
              </div>
              <button
                type="button"
                className="icon-close-btn"
                onClick={() => onSelectArtwork(null)}
                aria-label="Close detail view"
              >
                <X size={18} />
              </button>
            </div>

            <div className="artwork-detail-layout">
              <div className="artwork-detail-visual">
                <div className="detail-canvas-frame">
                  <PixelArtworkPreview
                    pixels={activeDetailArtwork.pixels}
                    gridSize={activeDetailArtwork.gridSize}
                    size={320}
                    showGrid={true}
                    backgroundColor="#18171F"
                  />
                </div>
                <div className="detail-action-strip">
                  <button
                    type="button"
                    className={`btn ${
                      currentUser && activeDetailArtwork.likes.includes(currentUser.id)
                        ? 'primary'
                        : ''
                    }`}
                    onClick={() => onToggleLike(activeDetailArtwork.id)}
                  >
                    <Heart size={15} /> Like ({activeDetailArtwork.likes.length})
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      exportSpritePng({
                        pixels: activeDetailArtwork.pixels,
                        gridSize: activeDetailArtwork.gridSize,
                        filename: activeDetailArtwork.title,
                      })
                    }
                  >
                    <Download size={15} /> Download PNG
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(window.location.href);
                      setShareFeedback('Link copied!');
                      setTimeout(() => setShareFeedback(null), 2000);
                    }}
                  >
                    <Share2 size={15} /> {shareFeedback || 'Share'}
                  </button>
                </div>
              </div>

              <div className="artwork-detail-info">
                <div className="creator-banner">
                  <button
                    type="button"
                    className="creator-chip large"
                    onClick={() => {
                      onSelectArtwork(null);
                      onInspectPlayer(activeDetailArtwork.creatorUsername);
                    }}
                  >
                    <span
                      className="creator-avatar-dot"
                      style={{ backgroundColor: activeDetailArtwork.creatorColor }}
                    >
                      {activeDetailArtwork.creatorAvatar}
                    </span>
                    <div>
                      <strong>@{activeDetailArtwork.creatorUsername}</strong>
                      <small>
                        Created {new Date(activeDetailArtwork.createdAt).toLocaleString()}
                      </small>
                    </div>
                  </button>
                </div>

                <p className="detail-description">{activeDetailArtwork.description}</p>

                <dl className="rows" style={{ marginBottom: 16 }}>
                  <dt>Dimensions</dt>
                  <dd>
                    {activeDetailArtwork.gridSize} × {activeDetailArtwork.gridSize} pixels
                  </dd>
                  <dt>Total Pixels</dt>
                  <dd>{activeDetailArtwork.pixels.length} colored cells</dd>
                </dl>

                {/* Comments Section inside Detail Modal */}
                <div className="detail-comments-box">
                  <h3>Comments ({activeArtworkComments.length})</h3>
                  <div className="detail-comments-list">
                    {activeArtworkComments.length === 0 ? (
                      <p className="empty-line">No comments yet — drop the first reaction!</p>
                    ) : (
                      activeArtworkComments.map((c) => (
                        <div key={c.id} className="comment-item">
                          <div className="comment-head">
                            <button
                              type="button"
                              className="inline-user-link"
                              onClick={() => {
                                onSelectArtwork(null);
                                onInspectPlayer(c.username);
                              }}
                            >
                              {c.avatarEmoji} @{c.username}
                            </button>
                            <div className="comment-meta">
                              <span>{new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <button
                                type="button"
                                className="report-mini-btn"
                                title="Report comment"
                                onClick={() => onReportComment(c.id, 'Reported from artwork view')}
                              >
                                <Flag size={11} />
                              </button>
                            </div>
                          </div>
                          <p className="comment-body">{c.content}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <form className="comment-form" onSubmit={handleDetailCommentSubmit}>
                    <input
                      type="text"
                      className="text-input"
                      placeholder="Write a supportive comment..."
                      maxLength={500}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                    />
                    <button type="submit" className="btn primary">
                      Post
                    </button>
                  </form>
                  {commentError && (
                    <p className="msg" data-kind="error">
                      {commentError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
