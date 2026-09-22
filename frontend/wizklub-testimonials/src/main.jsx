import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import OnlineStatus from './components/OnlineStatus.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <OnlineStatus />
      <App />
    </AuthProvider>
  </StrictMode>,
)
