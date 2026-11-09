import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dotwallMultiplayerPlugin } from './server/multiplayerPlugin';

export default defineConfig({
  plugins: [react(), dotwallMultiplayerPlugin()],
  base: './',
  server: {
    port: 5173,
    strictPort: false,
  },
});
