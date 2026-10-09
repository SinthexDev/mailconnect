import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/mailconnect/',
  plugins: [react()],
  server: {
    proxy: {
      '/mailconnect/api': 'http://127.0.0.1:3911',
      '/mailconnect/mcp': 'http://127.0.0.1:3911'
    }
  }
});
