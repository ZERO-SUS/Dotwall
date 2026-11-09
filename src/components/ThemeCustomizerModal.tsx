import React from 'react';
import { Monitor, Moon, Palette, RotateCcw, Sun, X } from 'lucide-react';

export interface AppearanceSettings {
  mode: 'light' | 'dark' | 'system';
  accentColor: string; // '' means default theme accent
  bgPreset: 'default' | 'oled' | 'paper' | 'indigo' | 'slate';
  canvasBgStyle: 'default' | 'obsidian' | 'blueprint' | 'parchment';
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  mode: 'system',
  accentColor: '',
  bgPreset: 'default',
  canvasBgStyle: 'default',
};

const APPEARANCE_STORAGE_KEY = 'dotwall_appearance_v2';

export function loadAppearanceSettings(): AppearanceSettings {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_APPEARANCE;
}

const ACCENT_PRESETS = [
  { hex: '', label: 'Default Purple', preview: '#6B3DFF' },
  { hex: '#0E9F68', label: 'Emerald Pulse', preview: '#0E9F68' },
  { hex: '#E0229B', label: 'Hot Magenta', preview: '#E0229B' },
  { hex: '#2D6BFF', label: 'Cobalt Hyper', preview: '#2D6BFF' },
  { hex: '#D97706', label: 'Solar Amber', preview: '#D97706' },
  { hex: '#E53935', label: 'Crimson Arcade', preview: '#E53935' },
];

const BG_PRESETS: { id: AppearanceSettings['bgPreset']; label: string; desc: string }[] = [
  { id: 'default', label: 'Dotwall Editorial', desc: 'Clean neutral surfaces' },
  { id: 'oled', label: 'Midnight OLED', desc: 'Deep pitch-black studio' },
  { id: 'paper', label: 'Warm Studio Paper', desc: 'Tactile ivory editorial' },
  { id: 'indigo', label: 'Deep Cyber Indigo', desc: 'Twilight cosmos tint' },
  { id: 'slate', label: 'Graphite Slate', desc: 'Neutral pro dark room' },
];

const CANVAS_BG_STYLES: { id: AppearanceSettings['canvasBgStyle']; label: string; color: string }[] = [
  { id: 'default', label: 'Auto Theme Default', color: '#ECEAF3' },
  { id: 'obsidian', label: 'Obsidian Void', color: '#1A1922' },
  { id: 'blueprint', label: 'Blueprint Navy', color: '#112236' },
  { id: 'parchment', label: 'Warm Parchment', color: '#EFECE4' },
];

export function applyAppearanceToDocument(settings: AppearanceSettings) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  let effectiveTheme: 'light' | 'dark' =
    settings.mode === 'system' ? (prefersDark ? 'dark' : 'light') : settings.mode;

  // Override effective theme if user selected a dark/light specific preset
  if (settings.bgPreset === 'oled' || settings.bgPreset === 'indigo' || settings.bgPreset === 'slate') {
    effectiveTheme = 'dark';
  } else if (settings.bgPreset === 'paper') {
    effectiveTheme = 'light';
  }

  root.setAttribute('data-theme', effectiveTheme);

  // Apply background preset overrides
  if (settings.bgPreset === 'oled') {
    root.style.setProperty('--bg', '#07070A');
    root.style.setProperty('--surface', '#111117');
    root.style.setProperty('--surface-elev', '#181820');
  } else if (settings.bgPreset === 'paper') {
    root.style.setProperty('--bg', '#F6F2E9');
    root.style.setProperty('--surface', '#FFFDF8');
    root.style.setProperty('--surface-elev', '#EFECE2');
  } else if (settings.bgPreset === 'indigo') {
    root.style.setProperty('--bg', '#0B0E1D');
    root.style.setProperty('--surface', '#13182E');
    root.style.setProperty('--surface-elev', '#1B223F');
  } else if (settings.bgPreset === 'slate') {
    root.style.setProperty('--bg', '#121418');
    root.style.setProperty('--surface', '#1A1D24');
    root.style.setProperty('--surface-elev', '#222630');
  } else {
    root.style.removeProperty('--bg');
    root.style.removeProperty('--surface');
    root.style.removeProperty('--surface-elev');
  }

  // Apply custom accent color
  if (settings.accentColor) {
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--accent-ink', '#FFFFFF');
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-ink');
  }

  // Apply custom canvas empty cell background
  if (settings.canvasBgStyle === 'obsidian') {
    root.style.setProperty('--cell-empty', '#1A1922');
  } else if (settings.canvasBgStyle === 'blueprint') {
    root.style.setProperty('--cell-empty', '#112236');
  } else if (settings.canvasBgStyle === 'parchment') {
    root.style.setProperty('--cell-empty', '#EFECE4');
  } else {
    root.style.removeProperty('--cell-empty');
  }

  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

interface ThemeCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppearanceSettings;
  onChange: (next: AppearanceSettings) => void;
}

export const ThemeCustomizerModal: React.FC<ThemeCustomizerModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="genz-pill accent">THEME &amp; APPEARANCE STUDIO</span>
            <h2 className="modal-title">Customize Dotwall Interface</h2>
          </div>
          <button type="button" className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* 1. Theme Mode (Light / Dark / System) */}
        <div className="form-group">
          <label className="form-label">Color Mode</label>
          <div className="seg" style={{ width: '100%' }}>
            <button
              type="button"
              style={{ flex: 1, justifyContent: 'center' }}
              aria-pressed={settings.mode === 'light'}
              onClick={() => onChange({ ...settings, mode: 'light', bgPreset: 'default' })}
            >
              <Sun size={13} /> Light
            </button>
            <button
              type="button"
              style={{ flex: 1, justifyContent: 'center' }}
              aria-pressed={settings.mode === 'dark'}
              onClick={() => onChange({ ...settings, mode: 'dark', bgPreset: 'default' })}
            >
              <Moon size={13} /> Dark
            </button>
            <button
              type="button"
              style={{ flex: 1, justifyContent: 'center' }}
              aria-pressed={settings.mode === 'system'}
              onClick={() => onChange({ ...settings, mode: 'system', bgPreset: 'default' })}
            >
              <Monitor size={13} /> System
            </button>
          </div>
        </div>

        {/* 2. Accent Color */}
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label">Accent Color</label>
          <div className="swatches" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {ACCENT_PRESETS.map((ac) => (
              <button
                key={ac.label}
                type="button"
                className="sw"
                style={{ backgroundColor: ac.preview }}
                aria-pressed={settings.accentColor === ac.hex}
                title={ac.label}
                onClick={() => onChange({ ...settings, accentColor: ac.hex })}
              />
            ))}
          </div>
        </div>

        {/* 3. Curated Background Themes */}
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label">Curated Background Theme</label>
          <div className="theme-preset-list">
            {BG_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`search-hit-row ${settings.bgPreset === p.id ? 'active-preset' : ''}`}
                style={{
                  borderColor: settings.bgPreset === p.id ? 'var(--accent)' : undefined,
                }}
                onClick={() => onChange({ ...settings, bgPreset: p.id })}
              >
                <span>
                  <b>{p.label}</b> — <small style={{ color: 'var(--muted)' }}>{p.desc}</small>
                </span>
                {settings.bgPreset === p.id && <span className="genz-pill accent">Active</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Canvas Background Style */}
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label">Canvas Background Style</label>
          <div className="two">
            {CANVAS_BG_STYLES.map((cs) => (
              <button
                key={cs.id}
                type="button"
                className="search-hit-row"
                style={{
                  borderColor: settings.canvasBgStyle === cs.id ? 'var(--accent)' : undefined,
                }}
                onClick={() => onChange({ ...settings, canvasBgStyle: cs.id })}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <i
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      backgroundColor: cs.color,
                      border: '1px solid var(--line)',
                      display: 'inline-block',
                    }}
                  />
                  <b>{cs.label}</b>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button
            type="button"
            className="btn"
            onClick={() => onChange(DEFAULT_APPEARANCE)}
          >
            <RotateCcw size={14} /> Reset to Default
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
