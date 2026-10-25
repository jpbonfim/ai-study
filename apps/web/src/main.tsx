import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { consumeCacheBustParams } from './lib/study-cache';
import './styles/global.css';
import './styles/app.css';

if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

void consumeCacheBustParams().finally(() => {
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
});
