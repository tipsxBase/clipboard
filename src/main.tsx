import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';
import './i18n/react';

const root = document.getElementById('app');

if (!root) {
  throw new Error('Missing root element #app');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);