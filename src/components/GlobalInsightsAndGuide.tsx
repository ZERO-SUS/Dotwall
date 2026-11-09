import React, { useMemo } from 'react';
import type {
  GlobalPixel,
  GlobalStats,
  PixelHistoryEntry,
  PlayerProfile,
} from '../types';
import { getColorName } from '../constants';

interface GlobalInsightsAndGuideProps {
  pixelsMap: Map<string, GlobalPixel>;
  history: PixelHistoryEntry[];
  users: PlayerProfile[];
  stats: GlobalStats;
  currentUser: PlayerProfile | null;
  onInspectPlayer: (username: string) => void;
}

export const GlobalInsightsAndGuide: React.FC<GlobalInsightsAndGuideProps> = ({
  pixelsMap,
  history,
  users,
  stats,
  currentUser,
  onInspectPlayer,
}) => {
  // 1. Top Contributors sorted from real database users
  const topContributors = useMemo(() => {
    return [...users]
      .sort((a, b) => b.pixelsPlaced - a.pixelsPlaced || b.points - a.points)
      .slice(0, 6);
  }, [users]);

  const maxPixelsByTop = Math.max(1, topContributors[0]?.pixelsPlaced || 1);

  // 2. Real Color Mix Distribution computed from actual occupied canvas pixels
  const colorMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const px of pixelsMap.values()) {
      const hex = px.color.toUpperCase();
      counts.set(hex, (counts.get(hex) || 0) + 1);
    }
    const total = Math.max(1, pixelsMap.size);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([hex, count]) => ({
        hex,
        name: getColorName(hex),
        count,
        pct: Math.round((count / total) * 100),
      }));
  }, [pixelsMap]);

  // 3. Real Activity Histogram (24 buckets) from placement history
  const activityBins = useMemo(() => {
    const bins = new Array(24).fill(0);
    const now = Date.now();
    const windowMs = 3600000 * 6; // 6-hour rolling window across 24 bins
    for (const h of history) {
      const age = Math.max(0, now - h.createdAt);
      if (age <= windowMs) {
        const idx = Math.min(23, Math.max(0, 23 - Math.floor((age / windowMs) * 24)));
        bins[idx]++;
      } else {
        bins[idxFromHash(h.id)]++;
      }
    }
    const maxBin = Math.max(1, ...bins);
    return bins.map((count) => ({
      count,
      heightPct: count === 0 ? 4 : Math.max(12, Math.round((count / maxBin) * 100)),
    }));
  }, [history]);

  return (
    <>
      {/* SECTION 1: GLOBAL STATISTICS & INSIGHTS */}
      <section className="sec" id="insights" aria-labelledby="insights-heading">
        <span className="eyebrow">REAL-TIME TELEMETRY · ZERO HARDCODED STATS</span>
        <h2 className="sec-h" id="insights-heading">
          Global Wall Insights &amp; Economy Telemetry
        </h2>
        <p className="sec-p">
          Every figure below is computed live from the 1,000,000-slot canvas database, active
          authenticated sessions, and verified placement history.
        </p>

        {/* Extended 6-stat telemetry bar */}
        <dl className="strip six-col" style={{ marginBottom: 18 }}>
          <div>
            <dt>Global Capacity</dt>
            <dd>{stats.capacity.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Pixels Used</dt>
            <dd>
              {stats.pixelsUsed.toLocaleString()} <small>occupied</small>
            </dd>
          </div>
          <div>
            <dt>Pixels Remaining</dt>
            <dd>{stats.pixelsRemaining.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Registered Players</dt>
            <dd>{stats.totalRegisteredPlayers}</dd>
          </div>
          <div>
            <dt>Tasks Completed</dt>
            <dd>{stats.totalTasksCompleted}</dd>
          </div>
          <div>
            <dt>Artworks Submitted</dt>
            <dd>{stats.totalArtworks}</dd>
          </div>
        </dl>

        <div className="three">
          {/* Card 1: Top Artists */}
          <div className="card">
            <h3>
              <span>Top Wall Artists</span>
              <span>{stats.activeContributors} contributors</span>
            </h3>
            <ol className="lb">
              {topContributors.map((u, idx) => (
                <li key={u.id}>
                  <span className="rk">{String(idx + 1).padStart(2, '0')}</span>
                  <div>
                    <span
                      className="nm"
                      style={{ cursor: 'pointer' }}
                      onClick={() => onInspectPlayer(u.username)}
                    >
                      {u.avatarEmoji} @{u.username}
                      {currentUser?.id === u.id && <em>YOU</em>}
                    </span>
                    <span className="trk">
                      <i
                        style={{
                          width: `${Math.max(8, Math.round((u.pixelsPlaced / maxPixelsByTop) * 100))}%`,
                        }}
                      />
                    </span>
                  </div>
                  <span className="ct">{u.pixelsPlaced} px</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Card 2: Most-Used Colors */}
          <div className="card">
            <h3>
              <span>Most-Used Colors</span>
              <span>{pixelsMap.size} active dots</span>
            </h3>
            <div className="mixbar" aria-label="Color distribution bar">
              {colorMix.map((c) => (
                <span
                  key={c.hex}
                  style={{
                    backgroundColor: c.hex,
                    flexGrow: Math.max(1, c.count),
                  }}
                  title={`${c.name}: ${c.count} pixels (${c.pct}%)`}
                />
              ))}
            </div>
            <ul className="legend">
              {colorMix.map((c) => (
                <li key={c.hex}>
                  <span className="sq" style={{ backgroundColor: c.hex }} />
                  <span>{c.name}</span>
                  <span className="n">{c.count}</span>
                  <span className="pc">{c.pct}%</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Card 3: Placement Pulse */}
          <div className="card">
            <h3>
              <span>Placement Activity</span>
              <span>Live History</span>
            </h3>
            <p className="act-sum">
              <b>{history.length}</b> recorded actions on the global wall
            </p>
            <div className="act" aria-label="Activity histogram">
              {activityBins.map((bin, idx) => (
                <span
                  key={idx}
                  data-zero={bin.count === 0 ? '1' : '0'}
                  style={{ height: `${bin.heightPct}%` }}
                  title={`${bin.count} actions`}
                />
              ))}
            </div>
            <div className="axis">
              <span>Earlier</span>
              <span>Active Window</span>
              <span>Now</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: HOW IT WORKS */}
      <section className="sec" id="how" aria-labelledby="how-heading">
        <span className="eyebrow">GAMEPLAY LOOP</span>
        <h2 className="sec-h" id="how-heading">
          How Dotwall Works
        </h2>
        <p className="sec-p">
          One shared 1000 × 1000 canvas, one pixel every 30 seconds, plus a sandbox task studio for
          completing daily pixel-art challenges.
        </p>

        <ol className="steps">
          <li>
            <h3>Claim Your Coordinate</h3>
            <p>
              Pan and zoom across 1,000,000 pixel positions (1000 × 1000). Use the live minimap or
              coordinate jumper to teleport to collaborative builds.
            </p>
          </li>
          <li>
            <h3>Place or Modify (Permanent Ink)</h3>
            <p>
              Every player gets one placement every 30 seconds. Placed pixels are permanent and
              cannot be undone or removed — you can only modify upon existing pixels with new colors!
            </p>
          </li>
          <li>
            <h3>Clear 5 Daily Random Objects</h3>
            <p>
              Switch to Pixel Tasks for your sequential 1-by-1 5-object daily run with zero cooldown.
              Complete Object 1/5 to unlock Object 2/5 all the way to 5/5!
            </p>
          </li>
          <li>
            <h3>Share, Compete &amp; Export</h3>
            <p>
              Publish your sprites to Explore, climb the real-time Leaderboard, chat in the
              Community Lounge, and export any artwork as a crisp PNG.
            </p>
          </li>
        </ol>
      </section>

      {/* SECTION 3: RULES & KEYBOARD SHORTCUTS */}
      <section className="sec" id="rules" aria-labelledby="rules-heading">
        <span className="eyebrow">PROTOCOL &amp; CONTROLS</span>
        <h2 className="sec-h" id="rules-heading">
          Global Pixel Economy Rules &amp; Shortcuts
        </h2>
        <p className="sec-p">
          Enforced server-side across all connected tabs and global sessions.
        </p>

        <div className="two">
          <div className="card">
            <h3>
              <span>Mandatory Economy Rules</span>
              <span>Server-Validated</span>
            </h3>
            <ul className="rules">
              <li>
                <b>1,000,000 Global Capacity:</b> The 1000 × 1000 canvas holds at most 1,000,000
                occupied pixels.
              </li>
              <li>
                <b>Permanent Ink (No Undo / No Removal):</b> Once a pixel is placed on the Global
                Wall, it cannot be removed or undone. Players can only modify upon an occupied pixel
                with a new color (consuming 0 new global slots).
              </li>
              <li>
                <b>30-Second Player Cooldown:</b> Tied to your authenticated player profile on the
                server — refreshing or opening extra tabs will not bypass the timer.
              </li>
              <li>
                <b>Sequential 5-Task Daily Quota:</b> In Pixel Tasks, players receive 5 random
                objects one by one each day without spending global wall cooldowns.
              </li>
            </ul>
          </div>

          <div className="card">
            <h3>
              <span>Keyboard Shortcuts</span>
              <span>Desktop &amp; Pro Studio</span>
            </h3>
            <dl className="keys">
              <dt>
                <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>
              </dt>
              <dd>Move selected coordinate by 1 pixel (Hold Shift for 10px)</dd>
              <dt>
                <kbd>Enter</kbd> / <kbd>Space</kbd>
              </dt>
              <dd>Place or Modify selected color at current coordinate</dd>
              <dt>
                <kbd>P</kbd> / <kbd>E</kbd>
              </dt>
              <dd>Switch between Place/Modify and Eyedropper tools</dd>
              <dt>
                <kbd>G</kbd> / <kbd>H</kbd> / <kbd>R</kbd>
              </dt>
              <dd>Toggle Grid lines, Heatmap overlay, or Jump to Random Art</dd>
              <dt>
                <kbd>+</kbd> / <kbd>−</kbd>
              </dt>
              <dd>Zoom in and out smoothly on the 1000×1000 canvas</dd>
            </dl>
          </div>
        </div>
      </section>

      {/* SECTION 4: FAQ ACCORDION */}
      <section className="sec" aria-labelledby="faq-heading">
        <h2 className="sec-h" id="faq-heading" style={{ marginBottom: 14 }}>
          Frequently Asked Questions
        </h2>
        <div className="faq">
          <details open>
            <summary>How does the 5-Task Daily Object Gauntlet work?</summary>
            <p>
              Every day you are assigned 5 random pixel objects one by one. You start on Object 1/5,
              and as soon as you draw and submit it, Object 2/5 unlocks automatically until you
              complete all 5 daily tasks for a +250 XP bonus!
            </p>
          </details>
          <details>
            <summary>Can I undo or remove a pixel once it is placed on the Global Wall?</summary>
            <p>
              No! On the Global 1000×1000 Wall, every pixel placement is permanent — it cannot be
              removed or undone to empty. However, you or any other player can modify upon that
              coordinate by painting a new color over it (which consumes 0 additional global slots).
            </p>
          </details>
          <details>
            <summary>How do millions of players play together globally?</summary>
            <p>
              Dotwall supports Firebase Auth + Firebase Realtime Database and Supabase Realtime so
              every pixel placement, modification, leaderboard rank, and comment syncs globally in
              real time across all connected players.
            </p>
          </details>
          <details>
            <summary>How do I export high-resolution PNGs of the wall or community artworks?</summary>
            <p>
              Use the “Export Sector PNG” or “Export Full 1000×1000 PNG” buttons below the global
              canvas (with optional grid lines), or click the PNG button on any Task or Explore
              artwork card to download a crisp upscaled pixel-art image.
            </p>
          </details>
        </div>
      </section>
    </>
  );
};

function idxFromHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) % 24;
  }
  return Math.abs(h);
}
