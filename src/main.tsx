import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

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
    <App />
  </StrictMode>,
);
