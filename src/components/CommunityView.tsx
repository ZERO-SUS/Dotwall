import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CornerDownRight,
  Flag,
  Heart,
  LogIn,
  MessageSquare,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type {
  CommunityArtwork,
  CommunityComment,
  OnlinePlayerPresence,
  PlayerProfile,
} from '../types';
import { PixelArtworkPreview } from './PixelArtworkPreview';

interface CommunityViewProps {
  comments: CommunityComment[];
  artworks: CommunityArtwork[];
  onlinePlayers: OnlinePlayerPresence[];
  currentUser: PlayerProfile | null;
  onPostComment: (payload: {
    artworkId: string | null;
    parentId?: string | null;
    content: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onReportComment: (
    commentId: string,
    reason: string,
    hideImmediately?: boolean
  ) => Promise<void>;
  onToggleLikeArtwork: (artworkId: string) => Promise<void>;
  onOpenArtwork: (art: CommunityArtwork) => void;
  onInspectPlayer: (username: string) => void;
}

export const CommunityView: React.FC<CommunityViewProps> = ({
  comments,
  artworks,
  onlinePlayers,
  currentUser,
  onPostComment,
  onReportComment,
  onToggleLikeArtwork,
  onOpenArtwork,
  onInspectPlayer,
}) => {
  const [newMessage, setNewMessage] = useState<string>('');
  const [selectedArtworkTag, setSelectedArtworkTag] = useState<string>('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<string>('');
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);

  // Moderation & Reporting Modal state
  const [reportingComment, setReportingComment] = useState<CommunityComment | null>(null);
  const [reportReason, setReportReason] = useState<string>('Spam or repetitive text');
  const [hideOnReport, setHideOnReport] = useState<boolean>(false);

  // Organize top-level comments and nested replies
  const { rootComments, repliesByParent } = useMemo(() => {
    const roots: CommunityComment[] = [];
    const replyMap = new Map<string, CommunityComment[]>();

    const visible = comments.filter((c) => !c.hidden);
    for (const c of visible) {
      if (c.parentId) {
        const list = replyMap.get(c.parentId) || [];
        list.push(c);
        replyMap.set(c.parentId, list);
      } else {
        roots.push(c);
      }
    }
    roots.sort((a, b) => b.createdAt - a.createdAt);
    return { rootComments: roots, repliesByParent: replyMap };
  }, [comments]);

  const handleMainPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setPostError(null);
    setPostSuccess(null);

    const res = await onPostComment({
      artworkId: selectedArtworkTag || null,
      parentId: null,
      content: newMessage,
    });

    if (res.ok) {
      setNewMessage('');
      setSelectedArtworkTag('');
      setPostSuccess('Posted to the community feed! (+5 XP)');
      setTimeout(() => setPostSuccess(null), 3000);
    } else {
      setPostError(res.error || 'Could not post comment.');
    }
  };

  const handleReplySubmit = async (e: React.FormEvent, parent: CommunityComment) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    setPostError(null);

    const res = await onPostComment({
      artworkId: parent.artworkId,
      parentId: parent.id,
      content: replyContent,
    });

    if (res.ok) {
      setReplyContent('');
      setReplyingToId(null);
    } else {
      setPostError(res.error || 'Could not post reply.');
    }
  };

  const handleConfirmReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingComment) return;
    await onReportComment(reportingComment.id, reportReason, hideOnReport);
    setReportingComment(null);
  };

  return (
    <div className="view-section">
      {/* Hero Banner */}
      <div className="section-hero-card">
        <div>
          <span className="eyebrow">COMMUNITY HUB · SAFE TEXT-ONLY DISCUSSIONS</span>
          <h1 className="view-title">Global Artists Lounge &amp; Discussions</h1>
          <p className="lede">
            Coordinate mega-builds on the 1000×1000 wall, hype up recent challenge submissions, and
            reply to fellow pixel artists. Protected by rate-limiting and live moderation.
          </p>
        </div>
        <div className="moderation-status-badge">
          <ShieldCheck size={18} color="var(--good)" />
          <div>
            <strong>Safe Community Guard Active</strong>
            <small>HTML stripped · 5s rate limit · Community report queue</small>
          </div>
        </div>
      </div>

      <div className="community-layout-grid">
        {/* Left Main Column: Post Composer & Threaded Discussions */}
        <div className="community-main-col">
          <form className="card composer-card" onSubmit={handleMainPost}>
            <h2>
              <span>Start a Discussion or Shoutout</span>
              <span className="pick">Text-only · Max 500 chars</span>
            </h2>

            <textarea
              className="text-input"
              rows={3}
              maxLength={500}
              placeholder="Coordinate a build at (500, 500) or shout out an artwork..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />

            <div className="composer-footer">
              <select
                className="select-input"
                value={selectedArtworkTag}
                onChange={(e) => setSelectedArtworkTag(e.target.value)}
              >
                <option value="">General Wall Discussion (No Artwork Attached)</option>
                {artworks.map((a) => (
                  <option key={a.id} value={a.id}>
                    Tag Artwork: {a.title} (@{a.creatorUsername})
                  </option>
                ))}
              </select>

              <button type="submit" className="btn primary">
                {currentUser ? (
                  <>
                    <Send size={14} /> Post Comment
                  </>
                ) : (
                  <>
                    <LogIn size={14} /> Sign In to Post
                  </>
                )}
              </button>
            </div>

            {postError && (
              <p className="msg" data-kind="error">
                {postError}
              </p>
            )}
            {postSuccess && (
              <p className="msg" style={{ color: 'var(--good)' }}>
                {postSuccess}
              </p>
            )}
          </form>

          {/* Discussions Feed */}
          <div className="card" style={{ marginTop: 18 }}>
            <h2>
              <span>Trending Discussions &amp; Artwork Comments</span>
              <span className="pick">{rootComments.length} threads</span>
            </h2>

            <div className="threads-list">
              {rootComments.map((cmt) => {
                const linkedArtwork = cmt.artworkId
                  ? artworks.find((a) => a.id === cmt.artworkId)
                  : null;
                const replies = repliesByParent.get(cmt.id) || [];

                return (
                  <div key={cmt.id} className="thread-card">
                    <div className="thread-header">
                      <button
                        type="button"
                        className="creator-chip"
                        onClick={() => onInspectPlayer(cmt.username)}
                      >
                        <span
                          className="creator-avatar-dot"
                          style={{ backgroundColor: cmt.avatarColor }}
                        >
                          {cmt.avatarEmoji}
                        </span>
                        <strong>@{cmt.username}</strong>
                      </button>

                      <div className="thread-meta">
                        {linkedArtwork && (
                          <button
                            type="button"
                            className="linked-art-pill"
                            onClick={() => onOpenArtwork(linkedArtwork)}
                          >
                            🎨 on “{linkedArtwork.title}”
                          </button>
                        )}
                        <span className="at">
                          {new Date(cmt.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          type="button"
                          className="report-mini-btn"
                          onClick={() => setReportingComment(cmt)}
                          title="Report or moderate comment"
                        >
                          <Flag size={12} /> Report
                        </button>
                      </div>
                    </div>

                    <p className="thread-body">{cmt.content}</p>

                    {cmt.reported && (
                      <div className="reported-notice">
                        <AlertTriangle size={12} /> Flagged for review: {cmt.reportReason}
                      </div>
                    )}

                    <div className="thread-actions">
                      <button
                        type="button"
                        className="thread-reply-btn"
                        onClick={() =>
                          setReplyingToId(replyingToId === cmt.id ? null : cmt.id)
                        }
                      >
                        <CornerDownRight size={13} /> Reply ({replies.length})
                      </button>
                    </div>

                    {/* Nested Replies */}
                    {replies.length > 0 && (
                      <div className="replies-container">
                        {replies.map((rep) => (
                          <div key={rep.id} className="reply-item">
                            <div className="thread-header">
                              <button
                                type="button"
                                className="inline-user-link"
                                onClick={() => onInspectPlayer(rep.username)}
                              >
                                {rep.avatarEmoji} @{rep.username}
                              </button>
                              <div className="thread-meta">
                                <span className="at">
                                  {new Date(rep.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                <button
                                  type="button"
                                  className="report-mini-btn"
                                  onClick={() => setReportingComment(rep)}
                                >
                                  <Flag size={11} />
                                </button>
                              </div>
                            </div>
                            <p className="thread-body">{rep.content}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply Input Box */}
                    {replyingToId === cmt.id && (
                      <form
                        className="reply-form"
                        onSubmit={(e) => handleReplySubmit(e, cmt)}
                      >
                        <input
                          type="text"
                          className="text-input"
                          placeholder={`Reply to @${cmt.username}...`}
                          maxLength={500}
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="btn primary">
                          Reply
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Online Presence & Recent Artwork Submissions */}
        <aside className="panel">
          <div className="card">
            <h2>
              <span>Active Players Online</span>
              <span className="pick">{onlinePlayers.length} live</span>
            </h2>
            {onlinePlayers.length === 0 ? (
              <p className="empty-line">Connecting to live presence...</p>
            ) : (
              <ul className="feed">
                {onlinePlayers.map((p) => (
                  <li key={p.userId}>
                    <span
                      className="sq"
                      style={{ backgroundColor: p.avatarColor || 'var(--good)', borderRadius: '50%' }}
                    />
                    <button
                      type="button"
                      className="inline-user-link"
                      style={{ textAlign: 'left' }}
                      onClick={() => onInspectPlayer(p.username)}
                    >
                      {p.avatarEmoji} @{p.username}
                    </button>
                    <span className="at">{p.activeView}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2>
              <span>Recent Submissions</span>
              <span className="pick">Click to inspect</span>
            </h2>
            <div className="recent-submissions-stack">
              {artworks.slice(0, 4).map((art) => {
                const liked = currentUser ? art.likes.includes(currentUser.id) : false;
                return (
                  <div key={art.id} className="community-art-row">
                    <div
                      className="comm-art-thumb"
                      onClick={() => onOpenArtwork(art)}
                      style={{ cursor: 'pointer' }}
                    >
                      <PixelArtworkPreview
                        pixels={art.pixels}
                        gridSize={art.gridSize}
                        size={64}
                        backgroundColor="#18171F"
                      />
                    </div>
                    <div className="comm-art-meta">
                      <strong
                        onClick={() => onOpenArtwork(art)}
                        style={{ cursor: 'pointer' }}
                      >
                        {art.title}
                      </strong>
                      <button
                        type="button"
                        className="inline-user-link"
                        onClick={() => onInspectPlayer(art.creatorUsername)}
                      >
                        by @{art.creatorUsername}
                      </button>
                      <div className="comm-art-btns">
                        <button
                          type="button"
                          className={`art-act-btn mini ${liked ? 'liked' : ''}`}
                          onClick={() => onToggleLikeArtwork(art.id)}
                        >
                          <Heart size={12} fill={liked ? 'currentColor' : 'none'} />{' '}
                          {art.likes.length}
                        </button>
                        <button
                          type="button"
                          className="art-act-btn mini"
                          onClick={() => onOpenArtwork(art)}
                        >
                          <MessageSquare size={12} /> {art.commentsCount}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* Report & Moderation Modal */}
      {reportingComment && (
        <div
          className="modal-backdrop"
          onClick={() => setReportingComment(null)}
          role="dialog"
          aria-modal="true"
        >
          <form
            className="modal-card compact-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmReport}
          >
            <div className="modal-header">
              <h2 className="modal-title">
                <ShieldAlert size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Report &amp; Moderate Comment
              </h2>
            </div>
            <p className="empty-line" style={{ marginBottom: 12 }}>
              Reporting comment by <b>@{reportingComment.username}</b>: “{reportingComment.content}”
            </p>
            <div className="form-group">
              <label className="form-label">Reason for Report</label>
              <select
                className="select-input"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              >
                <option value="Spam or repetitive text">Spam or repetitive text</option>
                <option value="Harassment or unfriendly behavior">
                  Harassment or unfriendly behavior
                </option>
                <option value="Inappropriate content">Inappropriate content</option>
                <option value="Off-topic advertising">Off-topic advertising</option>
              </select>
            </div>
            <label className="checkbox-row" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={hideOnReport}
                onChange={(e) => setHideOnReport(e.target.checked)}
              />
              <span>Hide this comment from public feed immediately</span>
            </label>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setReportingComment(null)}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary">
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
