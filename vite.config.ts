import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { llmPlugin } from './vite-llm-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // load all vars, not just VITE_
  return {
    plugins: [react(), llmPlugin(env)],
    server: {
      allowedHosts: ['finance.woitee.cz'],
    },
  };
});
