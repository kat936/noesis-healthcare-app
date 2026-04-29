/**
 * Noesis.io Health — application entry point
 * © 2026 Athena Core Technologies, Inc.
 *
 * Mounts the legacy single-file React component
 * (`/noesis-health-app.jsx` at the repo root) into the DOM. We keep the
 * legacy file intact rather than refactoring its 4,900 lines; this entry
 * point is the additive bridge that lets it build under Vite and ship
 * inside the Capacitor iOS WebView.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import NoesisApp from '../noesis-health-app.jsx';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Noesis.io Health: missing #root mount point in index.html');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <NoesisApp />
  </React.StrictMode>
);
