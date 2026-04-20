import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import App from './App';

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
console.log('[Convex] connecting to:', convexUrl ?? '(VITE_CONVEX_URL not set)');
const convex = new ConvexReactClient(convexUrl);

const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #11111b; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #11111b; }
  ::-webkit-scrollbar-thumb { background: #313244; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #45475a; }
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>,
);
