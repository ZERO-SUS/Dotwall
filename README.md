# DOTWALL — 1,000,000-Pixel Global Collaborative Multiplayer Game

**Dotwall** is an online collaborative pixel-art platform and multiplayer game built with **React**, **TypeScript**, **HTML5 Canvas**, **Vite**, and a dual-mode real-time multiplayer backend (**Supabase PostgreSQL + Realtime** & built-in **Node SSE/REST Multiplayer Server**).

---

## ✨ Features & Architecture

1. **1000 × 1000 Global Pixel Canvas (1,000,000 Slots)**
   - Hardware-accelerated dual-layer HTML5 Canvas (`1000 × 1000` offscreen pixel buffer + viewport transform matrix) for 60fps zooming (`0.65x` to `36x`), panning, grid lines, thermal heatmap, and time-lapse replay.
   - Interactive `148 × 148` live **Minimap** with viewport bounding box and one-click coordinate teleportation.
   - Precision tools: **Place (`P`)**, **Eyedropper (`E`)**, **Eraser (`X`)**, **Pan (`Space`/Drag)**, **Server-Validated Undo (`Ctrl+Z`)**, **Redo (`Ctrl+Y`)**, **Grid Toggle (`G`)**, **Heatmap (`H`)**, **Random Artwork Jumper (`R`)**, and **High-Resolution PNG Export**.

2. **Mandatory Global Pixel Economy & 30-Second Cooldown**
   - **Global Capacity**: `1,000,000` pixel slots (`1000 × 1000`).
   - **Slot Conservation**: Placing on an empty coordinate consumes `1` slot. Replacing an occupied coordinate consumes `0` additional slots. Erasing or undoing an occupied coordinate to empty frees `1` slot.
   - **30-Second Server-Side Cooldown**: Enforced per authenticated player account (`nextCooldownAt`). Persists across page refreshes and multiple tabs.
   - **Protected Ownership Undo**: Players can only undo their own eligible placements, and only if no other player has modified that coordinate since.

3. **Pixel Tasks (Sandbox Drawing Challenges)**
   - Separate `16 × 16` pixel drawing studio with **zero global cooldown** and **zero global slot consumption**.
   - Includes **Daily Challenges** and **Random Challenge Roller** (Apple, House, Tree, Cyber Cat, Rocket, Synthwave Car, Flower, UFO Spaceship, CRT Computer, 8-Bit Hero) with reference sprites, ghost guide overlay, flood-fill bucket, live match accuracy meter, XP rewards, and community gallery publishing.

4. **Explore Gallery, Leaderboards, Community Lounge & Player Profiles**
   - **Explore**: Random Artwork spotlight, Random Reference generator, category filters, search, likes, PNG export, and full Artwork Detail modal with nested comments.
   - **Global Leaderboard**: All-Time, Weekly, Monthly, Most Pixels, Most Tasks, Highest Points, and Top Creators with search and pagination.
   - **Community Lounge**: Threaded discussions, artwork tagging, nested replies, HTML sanitization, 5-second rate limiting, spam filter, and comment reporting/moderation.
   - **Player Profiles**: Customizable username, display name, bio, pixel emoji avatar, aura color, unlocked achievements, personal artwork gallery, and activity feed.

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Start the development server (Frontend + Built-in Real-Time Multiplayer API/SSE Server)
npm run dev
```

When running `npm run dev`, the integrated multiplayer server (`server/multiplayerPlugin.ts`) automatically persists all pixels, players, cooldowns, tasks, artworks, and comments to `server/data/dotwall-db.json` and streams real-time updates across all open tabs and LAN browsers via `/api/stream`.

---

## ☁️ Supabase Cloud Configuration & GitHub Pages Deployment

To deploy the frontend on **GitHub Pages** with **Supabase** as the cloud multiplayer backend:

1. Create a new project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard and run the complete migration script:
   - [`supabase/migrations/001_dotwall_schema.sql`](./supabase/migrations/001_dotwall_schema.sql)
3. Copy `.env.example` to `.env.local` (or add Repository Secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in GitHub Settings → Secrets and variables → Actions):
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```
   *(You can also enter these credentials directly inside the app by clicking the **Server Config** button in the top navigation bar or footer.)*
4. Push to your `main` branch — the included [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) workflow automatically builds and deploys the production bundle to **GitHub Pages**.
