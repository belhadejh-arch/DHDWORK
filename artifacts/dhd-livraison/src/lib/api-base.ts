/**
 * Returns the API base URL.
 *
 * - In development (Vite proxy): '' so requests go to /api/... via the Vite proxy.
 * - In production on Vercel: set VITE_API_URL to your Render backend URL,
 *   e.g. https://dhd-api.onrender.com
 *   The value must NOT have a trailing slash.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';
