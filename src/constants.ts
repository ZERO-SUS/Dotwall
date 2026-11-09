export interface SwatchColor {
  hex: string;
  name: string;
}

export const DOTWALL_PALETTE: SwatchColor[] = [
  { hex: '#6B3DFF', name: 'Electric Violet' },
  { hex: '#A08BFF', name: 'Soft Lavender' },
  { hex: '#5CF2B2', name: 'Cyber Mint' },
  { hex: '#0E9F68', name: 'Emerald Pulse' },
  { hex: '#D8FF4A', name: 'Acid Lime' },
  { hex: '#FFD93B', name: 'Solar Gold' },
  { hex: '#FF8A3C', name: 'Tangerine Pop' },
  { hex: '#E53935', name: 'Crimson Arcade' },
  { hex: '#FF84CB', name: 'Bubblegum Pink' },
  { hex: '#E0229B', name: 'Hot Magenta' },
  { hex: '#6FD6FF', name: 'Sky Cyan' },
  { hex: '#2D6BFF', name: 'Cobalt Hyper' },
  { hex: '#16151D', name: 'Obsidian Ink' },
  { hex: '#6B6980', name: 'Slate Muted' },
  { hex: '#9A98AE', name: 'Silver Mist' },
  { hex: '#FFFFFF', name: 'Pure White' },
  { hex: '#8E0000', name: 'Deep Ruby' },
  { hex: '#6D4C41', name: 'Cocoa Bark' },
  { hex: '#FF6F60', name: 'Coral Sunset' },
  { hex: '#00E5FF', name: 'Laser Aqua' },
  { hex: '#76FF03', name: 'Toxic Neon' },
  { hex: '#AA00FF', name: 'Ultraviolet' },
  { hex: '#FFEA00', name: 'Volt Yellow' },
  { hex: '#ECEAF3', name: 'Cloud Quartz' },
];

export const COLOR_NAME_MAP: Record<string, string> = Object.fromEntries(
  DOTWALL_PALETTE.map((c) => [c.hex.toUpperCase(), c.name])
);

export function getColorName(hex: string): string {
  const upper = (hex || '').toUpperCase();
  return COLOR_NAME_MAP[upper] || upper;
}

export const AVATAR_EMOJIS = [
  '👾', '🚀', '🌸', '⚡', '🛸', '🐱', '🔥', '💎', '🎮', '🌈', '🦊', '🍄', '🤖', '⭐', '🎨', '🐉'
];

export const AVATAR_COLORS = [
  '#6B3DFF', '#5CF2B2', '#FFD93B', '#FF84CB', '#E0229B', '#6FD6FF', '#D8FF4A', '#FF8A3C', '#2D6BFF', '#0E9F68'
];

export const CANVAS_SIZE = 1000; // 1000 x 1000
export const GLOBAL_CAPACITY = 1_000_000; // 1,000,000 pixel slots
export const COOLDOWN_SECONDS = 30; // 30-second cooldown per player
