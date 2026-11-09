import React, { useState } from 'react';

interface UserAvatarProps {
  user?: {
    username?: string;
    avatarEmoji?: string;
    avatarColor?: string;
    avatarUrl?: string | null;
  } | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  size = 32,
  className = '',
  style = {},
}) => {
  const [imgError, setImgError] = useState(false);
  const avatarUrl = !imgError && user?.avatarUrl && user.avatarUrl.trim() ? user.avatarUrl.trim() : null;
  const emoji = user?.avatarEmoji || '👾';
  const color = user?.avatarColor || '#6B3DFF';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={user?.username || 'User Avatar'}
        className={`user-dp-img ${className}`}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1.5px solid rgba(255, 255, 255, 0.25)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
          ...style,
        }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className={`user-avatar-badge ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(12, Math.round(size * 0.52)),
        lineHeight: 1,
        flexShrink: 0,
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        userSelect: 'none',
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {emoji}
    </span>
  );
};
