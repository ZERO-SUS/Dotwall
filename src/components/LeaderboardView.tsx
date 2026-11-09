import React, { useMemo, useState } from 'react';
import { Award, ChevronLeft, ChevronRight, Crown, Search, Sparkles, Trophy } from 'lucide-react';
import type { AchievementItem, CommunityArtwork, PlayerProfile } from '../types';

type LeaderboardCategory =
  | 'all_time'
  | 'weekly'
  | 'monthly'
  | 'most_pixels'
  | 'most_tasks'
  | 'highest_points'
  | 'top_creators';

interface LeaderboardViewProps {
  users: PlayerProfile[];
  artworks: CommunityArtwork[];
  achievementsCatalog: AchievementItem[];
  currentUser: PlayerProfile | null;
  onInspectPlayer: (username: string) => void;
}

const PAGE_SIZE = 8;

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  users,
  artworks,
  achievementsCatalog,
  currentUser,
  onInspectPlayer,
}) => {
  const [category, setCategory] = useState<LeaderboardCategory>('all_time');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const creatorCounts = useMemo(() => {
    const map = new Map<string, number>();
    artworks.forEach((a) => {
      map.set(a.creatorId, (map.get(a.creatorId) || 0) + 1 + a.likes.length);
    });
    return map;
  }, [artworks]);

  const rankedPlayers = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const monthAgo = now - 30 * 86400000;

    let pool = [...users];
    if (category === 'weekly') {
      pool = pool.filter((u) => (u.lastPixelAt || u.joinedAt) >= weekAgo);
    } else if (category === 'monthly') {
      pool = pool.filter((u) => (u.lastPixelAt || u.joinedAt) >= monthAgo);
    }

    pool.sort((a, b) => {
      if (category === 'most_pixels') {
        return b.pixelsPlaced - a.pixelsPlaced || b.points - a.points;
      }
      if (category === 'most_tasks') {
        return b.tasksCompleted - a.tasksCompleted || b.points - a.points;
      }
      if (category === 'top_creators') {
        const ca = creatorCounts.get(a.id) || 0;
        const cb = creatorCounts.get(b.id) || 0;
        return cb - ca || b.points - a.points;
      }
      // all_time, weekly, monthly, highest_points sort by total points + pixels
      return b.points - a.points || b.pixelsPlaced - a.pixelsPlaced;
    });

    return pool.map((u, idx) => ({
      ...u,
      rank: idx + 1,
      creatorScore: creatorCounts.get(u.id) || 0,
    }));
  }, [users, category, creatorCounts]);

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rankedPlayers;
    return rankedPlayers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q)
    );
  }, [rankedPlayers, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedPlayers = filteredPlayers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const topThree = rankedPlayers.slice(0, 3);
  const maxPoints = Math.max(1, rankedPlayers[0]?.points || 100);

  const categoriesList: { id: LeaderboardCategory; label: string }[] = [
    { id: 'all_time', label: 'All-Time' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'most_pixels', label: 'Most Pixels Placed' },
    { id: 'most_tasks', label: 'Most Tasks Completed' },
    { id: 'highest_points', label: 'Highest Points' },
    { id: 'top_creators', label: 'Top Creators' },
  ];

  return (
    <div className="view-section">
      <div className="section-hero-card">
        <div>
          <span className="eyebrow">GLOBAL LEADERBOARD · LIVE DATABASE RANKINGS</span>
          <h1 className="view-title">Hall of Fame &amp; Top Contributors</h1>
          <p className="lede">
            Real-time rankings calculated from verified pixel placements, completed drawing tasks,
            and community artwork engagement.
          </p>
        </div>
        {currentUser && (
          <div className="my-rank-pill-card">
            <span className="eyebrow">YOUR GLOBAL RANK</span>
            <div className="my-rank-num">
              #{rankedPlayers.find((p) => p.id === currentUser.id)?.rank || '—'}
            </div>
            <span className="mono-stat">
              {currentUser.points.toLocaleString()} XP · {currentUser.pixelsPlaced} pixels
            </span>
          </div>
        )}
      </div>

      {/* Category Tabs */}
      <div className="category-pills-row">
        {categoriesList.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`cat-pill ${category === c.id ? 'active' : ''}`}
            onClick={() => {
              setCategory(c.id);
              setPage(1);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Top 3 Podium Cards */}
      <div className="three" style={{ marginBottom: 24 }}>
        {topThree.map((player, idx) => {
          const medalColors = ['#FFD93B', '#5CF2B2', '#FF84CB'];
          const medalLabels = ['1ST PLACE · CROWN', '2ND PLACE · SILVER', '3RD PLACE · BRONZE'];
          return (
            <div
              key={player.id}
              className="card podium-card"
              onClick={() => onInspectPlayer(player.username)}
              style={{ cursor: 'pointer' }}
            >
              <div className="podium-top">
                <span
                  className="genz-pill"
                  style={{
                    backgroundColor: medalColors[idx],
                    color: '#16151D',
                    fontWeight: 700,
                  }}
                >
                  <Crown size={12} /> {medalLabels[idx]}
                </span>
                <span className="mono-stat">{player.points.toLocaleString()} XP</span>
              </div>

              <div className="podium-user">
                <div
                  className="podium-avatar"
                  style={{ backgroundColor: player.avatarColor }}
                >
                  {player.avatarEmoji}
                </div>
                <div>
                  <div className="podium-name">
                    @{player.username}
                    {currentUser?.id === player.id && <em className="you-tag">YOU</em>}
                  </div>
                  <div className="podium-sub">
                    {player.pixelsPlaced} pixels · {player.tasksCompleted} tasks
                  </div>
                </div>
              </div>

              <div className="trk" style={{ marginTop: 12 }}>
                <i style={{ width: `${Math.round((player.points / maxPoints) * 100)}%` }} />
              </div>

              <div className="podium-badges">
                {(player.achievements || []).slice(0, 5).map((achId) => {
                  const def = achievementsCatalog.find((a) => a.id === achId);
                  return def ? (
                    <span key={achId} className="mini-ach-badge" title={def.title}>
                      {def.icon} {def.title}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Search & Full Rankings Table */}
      <div className="card">
        <div className="leaderboard-table-header">
          <h2>
            <span>Player Standings</span>
            <span className="pick">{filteredPlayers.length} ranked players</span>
          </h2>
          <div className="search-input-wrap compact">
            <Search size={14} />
            <input
              type="search"
              placeholder="Search @username..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="leaderboard-table-wrap">
          <table className="lb-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Pixels Placed</th>
                <th>Tasks Done</th>
                <th>Points (XP)</th>
                <th>Badges</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPlayers.map((p) => {
                const isMe = currentUser?.id === p.id;
                return (
                  <tr
                    key={p.id}
                    className={isMe ? 'lb-row-me' : ''}
                    onClick={() => onInspectPlayer(p.username)}
                  >
                    <td className="mono-cell">#{p.rank}</td>
                    <td>
                      <div className="lb-player-cell">
                        <span
                          className="creator-avatar-dot"
                          style={{ backgroundColor: p.avatarColor }}
                        >
                          {p.avatarEmoji}
                        </span>
                        <div>
                          <strong>@{p.username}</strong>
                          {isMe && <em className="you-tag">you</em>}
                          <div className="lb-bio-preview">{p.displayName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="mono-cell">
                      <b>{p.pixelsPlaced.toLocaleString()}</b> px
                    </td>
                    <td className="mono-cell">{p.tasksCompleted}</td>
                    <td className="mono-cell">
                      <span className="xp-pill">{p.points.toLocaleString()} XP</span>
                    </td>
                    <td>
                      <div className="badge-icons-row">
                        {(p.achievements || []).map((achId) => {
                          const def = achievementsCatalog.find((a) => a.id === achId);
                          return def ? (
                            <span
                              key={achId}
                              className="badge-dot-icon"
                              title={`${def.title}: ${def.description}`}
                            >
                              {def.icon}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pagination-bar">
          <span className="mono-stat">
            Page {currentPage} of {totalPages}
          </span>
          <div className="seg">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
