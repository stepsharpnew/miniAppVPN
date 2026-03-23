import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import WebApp from '@twa-dev/sdk';
import App from './App';
import './styles/global.css';

function dismissTelegramLoader() {
  try {
    WebApp.ready();
  } catch {
    /* вне Telegram WebView */
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  dismissTelegramLoader();
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (err) {
    console.error(err);
    dismissTelegramLoader();
  }
}
