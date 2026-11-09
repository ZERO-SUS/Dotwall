import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Layers,
  MapPin,
  Paintbrush,
  Sparkles,
  Undo2,
  User,
  X,
  Zap,
} from 'lucide-react';
import { GlobalPixel, isDeveloperAdmin, isPlatformOwner, PlayerProfile } from '../types';
import { getColorName } from '../constants';
import { formatCountryDisplay } from '../utils/countryHelper';
import { UserAvatar } from './UserAvatar';

interface PixelInfoModalProps {
  coord: { x: number; y: number };
  pixel: GlobalPixel | null;
  ownerProfile?: PlayerProfile | null;
  currentUser: PlayerProfile | null;
  onClose: () => void;
  onInspectPlayer: (username: string) => void;
  onPlaceAtCoord?: (x: number, y: number) => void;
  onUndoPixel?: () => void;
}

export const PixelInfoModal: React.FC<PixelInfoModalProps> = ({
  coord,
  pixel,
  ownerProfile,
  currentUser,
  onClose,
  onInspectPlayer,
  onPlaceAtCoord,
  onUndoPixel,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCoord, setCopiedCoord] = useState(false);

  const chunkX = Math.floor(coord.x / 50);
  const chunkY = Math.floor(coord.y / 50);

  const isOwner = Boolean(
    currentUser &&
      pixel &&
      ((currentUser.id && currentUser.id === pixel.ownerId) ||
        (currentUser.username &&
          currentUser.username.toLowerCase() === pixel.ownerUsername.toLowerCase()))
  );

  const isOwnerAdmin = ownerProfile ? isDeveloperAdmin(ownerProfile) : false;
  const isOwnerPlatformMaster = ownerProfile ? isPlatformOwner(ownerProfile) : false;

  // Country resolution: from pixel.ownerCountry, or ownerProfile.country, or default
  const countryDisplay = formatCountryDisplay(
    pixel?.ownerCountry || ownerProfile?.country || null
  );

  // Date and Time formatting
  const updatedAtMs = pixel?.updatedAt || 0;
  const dateFormatted = updatedAtMs > 0 ? new Date(updatedAtMs).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) : 'Just now';

  const timeFormatted = updatedAtMs > 0 ? new Date(updatedAtMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) : '';

  const getRelativeTime = (ts: number): string => {
    if (!ts) return 'Just now';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const handleCopyCoord = () => {
    navigator.clipboard?.writeText(`${coord.x}, ${coord.y}`);
    setCopiedCoord(true);
    setTimeout(() => setCopiedCoord(false), 2500);
  };

  const handleCopyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?x=${coord.x}&y=${coord.y}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="card compact-modal"
        style={{
          maxWidth: 480,
          width: '92%',
          margin: '40px auto',
          position: 'relative',
          padding: 24,
          border: '2px solid var(--accent)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 16,
            borderBottom: '1px solid var(--line)',
            paddingBottom: 12,
          }}
        >
          <div>
            <span className="genz-pill accent" style={{ fontSize: 10, padding: '3px 8px' }}>
              CHUNK {chunkX}_{chunkY} · SECTOR ({coord.x}, {coord.y})
            </span>
            <h2 style={{ margin: '6px 0 2px', fontSize: 20 }}>
              <span>Pixel Information</span>
            </h2>
            <small style={{ color: 'var(--muted)', fontSize: 12 }}>
              Coordinates ({coord.x}, {coord.y}) on the 1000×1000 global canvas
            </small>
          </div>
          <button
            type="button"
            className="mini-link-btn"
            onClick={onClose}
            aria-label="Close"
            style={{ padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {pixel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Color Swatch & Coordinate Card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 14px',
                borderRadius: 12,
                background: 'var(--bg)',
                border: '1px solid var(--line)',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 10,
                  backgroundColor: pixel.color,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: `0 4px 14px ${pixel.color}44`,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: 15, display: 'block' }}>
                  {getColorName(pixel.color)}
                </strong>
                <code style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>
                  {pixel.color.toUpperCase()}
                </code>
                <span
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: 'var(--muted)',
                    marginTop: 2,
                  }}
                >
                  Version {pixel.version}
                  {pixel.prevColor && (
                    <>
                      {' '}· replaced{' '}
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: pixel.prevColor,
                          verticalAlign: 'middle',
                        }}
                      />{' '}
                      {pixel.prevColor}
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Owner Artist Card */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'var(--bg)',
                border: '1px solid var(--line)',
              }}
            >
              <small
                style={{
                  color: 'var(--muted)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                Pixel Owner &amp; Contributor
              </small>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <UserAvatar
                  user={{
                    username: pixel.ownerUsername,
                    avatarEmoji: ownerProfile?.avatarEmoji || '🎨',
                    avatarColor: ownerProfile?.avatarColor || pixel.color,
                    avatarUrl: ownerProfile?.avatarUrl || pixel.ownerAvatarUrl || null,
                  }}
                  size={46}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="inline-user-link"
                      style={{ fontSize: 15, fontWeight: 700 }}
                      onClick={() => {
                        onClose();
                        onInspectPlayer(pixel.ownerUsername);
                      }}
                    >
                      @{pixel.ownerUsername}
                    </button>
                    {isOwnerPlatformMaster && (
                      <span className="genz-pill daily" style={{ fontSize: 10, padding: '2px 6px' }}>
                        👑 OWNER
                      </span>
                    )}
                    {!isOwnerPlatformMaster && isOwnerAdmin && (
                      <span className="genz-pill accent" style={{ fontSize: 10, padding: '2px 6px' }}>
                        👑 ADMIN
                      </span>
                    )}
                    {isOwner && (
                      <span
                        className="genz-pill"
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          background: 'rgba(14, 159, 104, 0.15)',
                          color: 'var(--good)',
                        }}
                      >
                        YOU
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--muted)',
                      marginTop: 2,
                    }}
                  >
                    <span>{countryDisplay}</span>
                    {ownerProfile && (
                      <>
                        <span>·</span>
                        <span>{ownerProfile.points || 0} XP</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="tbtn"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    onClose();
                    onInspectPlayer(pixel.ownerUsername);
                  }}
                >
                  <User size={13} /> View Profile
                </button>
              </div>
            </div>

            {/* Placement Timestamp Details */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 11 }}>
                  <Calendar size={12} /> Placed Date
                </div>
                <strong style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
                  {dateFormatted}
                </strong>
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                  {getRelativeTime(updatedAtMs)}
                </small>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 11 }}>
                  <Clock size={12} /> Exact Time
                </div>
                <strong style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
                  {timeFormatted || 'Recent'}
                </strong>
                <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </small>
              </div>
            </div>

            {/* Action Buttons Strip */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 6,
                paddingTop: 12,
                borderTop: '1px solid var(--line)',
              }}
            >
              <button
                type="button"
                className="btn"
                style={{ flex: 1, minWidth: 120 }}
                onClick={handleCopyCoord}
              >
                {copiedCoord ? <Check size={14} color="var(--good)" /> : <Copy size={14} />}
                {copiedCoord ? 'Coordinates Copied!' : 'Copy Coord'}
              </button>

              <button
                type="button"
                className="btn"
                style={{ flex: 1, minWidth: 120 }}
                onClick={handleCopyShareLink}
              >
                {copiedLink ? <Check size={14} color="var(--good)" /> : <ExternalLink size={14} />}
                {copiedLink ? 'Link Copied!' : 'Share Link'}
              </button>

              {onPlaceAtCoord && (
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    onClose();
                    onPlaceAtCoord(coord.x, coord.y);
                  }}
                >
                  <Paintbrush size={14} /> Paint / Replace at ({coord.x}, {coord.y})
                </button>
              )}

              {isOwner && onUndoPixel && (
                <button
                  type="button"
                  className="tbtn"
                  style={{ width: '100%', justifyContent: 'center', color: 'var(--accent)' }}
                  onClick={() => {
                    onClose();
                    onUndoPixel();
                  }}
                >
                  <Undo2 size={13} /> Undo Your Placement at ({coord.x}, {coord.y})
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Empty Unclaimed Slot */
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                border: '2px dashed var(--line)',
                margin: '0 auto 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--muted)',
              }}
            >
              <Sparkles size={28} />
            </div>
            <h3 style={{ margin: '0 0 6px' }}>Empty Canvas Position</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, margin: '0 auto 16px', maxWidth: 360 }}>
              Position <b>({coord.x}, {coord.y})</b> in Chunk <b>{chunkX}_{chunkY}</b> is currently unclaimed. Placing a pixel here will permanently record your username, avatar DP, date, time, and country!
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {onPlaceAtCoord && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    onClose();
                    onPlaceAtCoord(coord.x, coord.y);
                  }}
                >
                  <Paintbrush size={14} /> Place Pixel Here Now
                </button>
              )}
              <button type="button" className="btn" onClick={handleCopyCoord}>
                {copiedCoord ? <Check size={14} color="var(--good)" /> : <Copy size={14} />}
                {copiedCoord ? 'Copied!' : 'Copy Position'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
