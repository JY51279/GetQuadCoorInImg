import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    optimizer({
      electron: `const { ipcRenderer } = require('electron'); export { ipcRenderer };`,
    }),
  ],
});
