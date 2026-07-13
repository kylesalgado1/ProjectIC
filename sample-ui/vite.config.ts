import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` must match the GitHub repo name so assets load correctly from
// https://kylesalgado1.github.io/ProjectIC/ . Local dev/preview stay at "/".
// (If you ever rename the repo, update the path below to match.)
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ProjectIC/' : '/',
  plugins: [react()],
}));
