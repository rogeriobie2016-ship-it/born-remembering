import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev` serves HTTPS on the LAN (needed for WebXR / gyro on phone and Quest).
// `npm run dev:http` serves plain HTTP (fine for localhost or `adb reverse`).
export default defineConfig(({ mode }) => ({
  base: './',
  build: { chunkSizeWarningLimit: 900 }, // three.js alone is ~500 kB (135 kB gzipped)
  plugins: mode === 'http' ? [] : [basicSsl()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}));
