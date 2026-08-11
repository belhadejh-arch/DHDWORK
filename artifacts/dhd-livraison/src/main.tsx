import { createRoot } from 'react-dom/client';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Point API calls to the backend (set VITE_API_URL in Vercel env vars).
// Falls back to relative URLs when running locally / on the same origin.
if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
}

// Admin session token — persisted so admins stay logged in across reloads.
setAuthTokenGetter(() => localStorage.getItem('dhd_admin_token'));

createRoot(document.getElementById('root')!).render(<App />);
