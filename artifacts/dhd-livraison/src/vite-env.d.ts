/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full URL of the Render (or other) backend, e.g. https://dhd-api.onrender.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
