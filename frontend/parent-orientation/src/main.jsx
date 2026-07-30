/**
 * Optional React entry — the production UI is the legacy client (`frontend/public/index.html` + `app.js`)
 * with full PMO/Speaker hash routes and features. This bundle is only built for optional tooling.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';

function OptionalNotice() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24, maxWidth: 560 }}>
      <h1 style={{ fontSize: 18 }}>Parent Orientation Tracker</h1>
      <p>
        The full application (PMO + Speaker, hash routes, Excel, analytics) is served at the site root{' '}
        <a href="/">/</a> using the legacy shell and <code>app.js</code>.
      </p>
      <p style={{ color: '#666', fontSize: 14 }}>
        This page only appears if <code>react-app.js</code> is loaded without the legacy HTML shell.
      </p>
    </main>
  );
}

const el = document.getElementById('root');
if (el) createRoot(el).render(<OptionalNotice />);
