import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import type { AuthModule } from './auth/types';

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

async function mount() {
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

  let mod: AuthModule;
  if (clerkKey) {
    mod = await import('./auth/clerk');
  } else {
    mod = await import('./auth/none');
  }

  const { AppProvider } = mod;

  console.log(
    `[auth] provider: ${clerkKey ? 'clerk' : 'none'}`,
    `| Convex: ${import.meta.env.VITE_CONVEX_URL ?? '(not set)'}`,
  );

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>,
  );
}

mount();
