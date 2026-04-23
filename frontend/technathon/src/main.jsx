// Application entry: this file runs first in the browser bundle (see index.html → script type="module").
import { StrictMode } from 'react' // React wrapper that enables extra development checks on child components
import { createRoot } from 'react-dom/client' // React 18 API to mount the tree into a DOM element
import './index.css' // Global styles for the whole app (layout, theme, utilities)
import 'react-toastify/dist/ReactToastify.css' // Default styles for toast notifications used across pages
import App from './App.jsx' // Root component: router, navbar, routes to all screens

// Attach React to the div#root in client/index.html and render the app inside StrictMode.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
