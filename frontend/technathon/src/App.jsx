/**
 * Root React component: React Router + toast host + page layout.
 * Routes: home/submit gate, signed submission form, admin login + dashboard.
 * See: ../../docs/file-notes/client/src/App.jsx.md  |  ../../FRONTEND.md
 */
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import HomeGate from './components/HomeGate';
import SubmissionForm from './components/SubmissionForm';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';

// ── EdTech Background Icons (SVG) ─────────────────────────
const BgCanvas = () => (
  <div className="bg-canvas">

    {/* ── Lightbulb – top left ── */}
    <svg className="bg-icon" style={{ top: '6%', left: '3%', width: 90, animation: 'floatA 7s ease-in-out infinite', animationDelay: '0s' }} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="26" r="16" fill="#EF5A2C" />
      <rect x="26" y="42" width="12" height="4" rx="2" fill="#F6AC41" />
      <rect x="28" y="46" width="8" height="4" rx="2" fill="#EF5A2C" />
      <line x1="32" y1="10" x2="32" y2="6" stroke="#F6AC41" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="44" y1="15" x2="47" y2="12" stroke="#F6AC41" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="20" y1="15" x2="17" y2="12" stroke="#F6AC41" strokeWidth="2.5" strokeLinecap="round" />
    </svg>

    {/* ── Atom – top right ── */}
    <svg className="bg-icon" style={{ top: '4%', right: '5%', width: 110, animation: 'floatE 14s linear infinite', animationDelay: '-3s', opacity: 0.08 }} viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="40" rx="36" ry="14" stroke="#F6AC41" strokeWidth="3" />
      <ellipse cx="40" cy="40" rx="36" ry="14" stroke="#F6AC41" strokeWidth="3" transform="rotate(60 40 40)" />
      <ellipse cx="40" cy="40" rx="36" ry="14" stroke="#EF5A2C" strokeWidth="3" transform="rotate(120 40 40)" />
      <circle cx="40" cy="40" r="5" fill="#F6AC41" />
    </svg>

    {/* ── Open Book – left center ── */}
    <svg className="bg-icon" style={{ top: '35%', left: '1%', width: 100, animation: 'floatB 9s ease-in-out infinite', animationDelay: '-1s' }} viewBox="0 0 80 60" fill="none">
      <path d="M40 12 C30 8 10 10 5 14 L5 52 C10 48 30 46 40 50 Z" fill="#F6AC41" />
      <path d="M40 12 C50 8 70 10 75 14 L75 52 C70 48 50 46 40 50 Z" fill="#EF5A2C" />
      <line x1="40" y1="12" x2="40" y2="50" stroke="#fff" strokeWidth="2" opacity="0.5" />
      <line x1="15" y1="22" x2="35" y2="20" stroke="#fff" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
      <line x1="15" y1="30" x2="35" y2="28" stroke="#fff" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
      <line x1="15" y1="38" x2="35" y2="36" stroke="#fff" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
      <line x1="45" y1="22" x2="65" y2="20" stroke="#fff" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
      <line x1="45" y1="30" x2="65" y2="28" stroke="#fff" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
    </svg>

    {/* ── Rocket – bottom left ── */}
    <svg className="bg-icon" style={{ bottom: '10%', left: '6%', width: 80, animation: 'floatC 8s ease-in-out infinite', animationDelay: '-4s' }} viewBox="0 0 50 70" fill="none">
      <path d="M25 5 C25 5 10 25 10 42 L25 55 L40 42 C40 25 25 5 25 5Z" fill="#EF5A2C" />
      <circle cx="25" cy="32" r="7" fill="#FFF" opacity="0.6" />
      <path d="M14 45 L8 58 L20 52 Z" fill="#F6AC41" />
      <path d="M36 45 L42 58 L30 52 Z" fill="#F6AC41" />
      <path d="M19 54 L25 62 L31 54 Z" fill="#F0652A" />
    </svg>

    {/* ── Graduation Cap – bottom right ── */}
    <svg className="bg-icon" style={{ bottom: '8%', right: '4%', width: 105, animation: 'floatA 10s ease-in-out infinite', animationDelay: '-6s' }} viewBox="0 0 80 60" fill="none">
      <polygon points="40,6 74,22 40,38 6,22" fill="#EF5A2C" />
      <path d="M58 30 L58 46 C58 54 22 54 22 46 L22 30" fill="#F6AC41" opacity="0.9" />
      <line x1="74" y1="22" x2="74" y2="40" stroke="#EF5A2C" strokeWidth="3" strokeLinecap="round" />
      <circle cx="74" cy="43" r="4" fill="#F6AC41" />
    </svg>

    {/* ── Pencil – right center ── */}
    <svg className="bg-icon" style={{ top: '42%', right: '2%', width: 80, animation: 'floatB 11s ease-in-out infinite', animationDelay: '-2s', transform: 'rotate(-30deg)' }} viewBox="0 0 20 80" fill="none">
      <rect x="5" y="5" width="10" height="55" rx="2" fill="#F6AC41" />
      <rect x="5" y="5" width="10" height="10" rx="2" fill="#ddd" />
      <polygon points="5,60 15,60 10,75" fill="#EF5A2C" />
      <line x1="5" y1="15" x2="15" y2="15" stroke="#F0652A" strokeWidth="1.5" />
    </svg>

    {/* ── Star 1 – scattered ── */}
    <svg className="bg-icon" style={{ top: '18%', left: '15%', width: 44, animation: 'pulse-glow 4s ease-in-out infinite', animationDelay: '0s' }} viewBox="0 0 24 24" fill="#F6AC41">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>

    {/* ── Star 2 ── */}
    <svg className="bg-icon" style={{ top: '60%', left: '20%', width: 32, animation: 'pulse-glow 5s ease-in-out infinite', animationDelay: '-1.5s' }} viewBox="0 0 24 24" fill="#EF5A2C">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>

    {/* ── Star 3 ── */}
    <svg className="bg-icon" style={{ top: '22%', right: '18%', width: 38, animation: 'pulse-glow 6s ease-in-out infinite', animationDelay: '-3s' }} viewBox="0 0 24 24" fill="#F6AC41">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>

    {/* ── Star 4 ── */}
    <svg className="bg-icon" style={{ bottom: '30%', right: '14%', width: 28, animation: 'pulse-glow 4.5s ease-in-out infinite', animationDelay: '-2s' }} viewBox="0 0 24 24" fill="#F59222">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>

    {/* ── DNA / Helix – upper-center-right ── */}
    <svg className="bg-icon" style={{ top: '8%', left: '40%', width: 60, animation: 'floatD 12s ease-in-out infinite', animationDelay: '-5s' }} viewBox="0 0 40 80" fill="none">
      <path d="M10 5 Q30 20 10 35 Q30 50 10 65" stroke="#F6AC41" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M30 5 Q10 20 30 35 Q10 50 30 65" stroke="#EF5A2C" strokeWidth="3" strokeLinecap="round" fill="none" />
      <line x1="13" y1="14" x2="27" y2="14" stroke="#F0652A" strokeWidth="2" strokeLinecap="round" />
      <line x1="10" y1="35" x2="30" y2="35" stroke="#F6AC41" strokeWidth="2" strokeLinecap="round" />
      <line x1="13" y1="56" x2="27" y2="56" stroke="#F0652A" strokeWidth="2" strokeLinecap="round" />
    </svg>

    {/* ── Math Pi symbol ── */}
    <svg className="bg-icon" style={{ bottom: '22%', left: '30%', width: 70, animation: 'floatC 9s ease-in-out infinite', animationDelay: '-7s', opacity: 0.07 }} viewBox="0 0 60 60" fill="none">
      <text x="4" y="50" fontFamily="Georgia, serif" fontSize="52" fontWeight="bold" fill="#EF5A2C">π</text>
    </svg>

    {/* ── Sigma symbol ── */}
    <svg className="bg-icon" style={{ top: '50%', right: '22%', width: 65, animation: 'floatA 8s ease-in-out infinite', animationDelay: '-3.5s', opacity: 0.07 }} viewBox="0 0 60 60" fill="none">
      <text x="6" y="50" fontFamily="Georgia, serif" fontSize="52" fontWeight="bold" fill="#F6AC41">Σ</text>
    </svg>

    {/* ── Infinity symbol – bottom center ── */}
    <svg className="bg-icon" style={{ bottom: '12%', left: '45%', width: 80, animation: 'floatB 13s ease-in-out infinite', animationDelay: '-8s', opacity: 0.07 }} viewBox="0 0 80 40" fill="none">
      <path d="M20 20 C20 10 10 5 5 12 C0 20 5 30 15 28 C25 26 30 20 40 20 C50 20 55 26 65 28 C75 30 80 20 75 12 C70 5 60 10 60 20 C60 30 50 26 40 20 Z" fill="none" stroke="#F6AC41" strokeWidth="3" />
    </svg>

    {/* ── Trophy – top center-left ── */}
    <svg className="bg-icon" style={{ top: '28%', left: '8%', width: 72, animation: 'floatD 10s ease-in-out infinite', animationDelay: '-2s' }} viewBox="0 0 60 70" fill="none">
      <rect x="20" y="52" width="20" height="6" rx="2" fill="#F6AC41" />
      <rect x="14" y="58" width="32" height="6" rx="3" fill="#EF5A2C" />
      <path d="M12 10 L12 32 C12 44 48 44 48 32 L48 10 Z" fill="#F6AC41" />
      <path d="M12 16 C12 16 4 16 4 24 C4 32 12 32 12 32" stroke="#EF5A2C" strokeWidth="3" fill="none" />
      <path d="M48 16 C48 16 56 16 56 24 C56 32 48 32 48 32" stroke="#EF5A2C" strokeWidth="3" fill="none" />
      <line x1="30" y1="44" x2="30" y2="52" stroke="#F0652A" strokeWidth="3" strokeLinecap="round" />
    </svg>

    {/* ── Microscope dots – bottom center-right ── */}
    <svg className="bg-icon" style={{ bottom: '25%', right: '8%', width: 75, animation: 'floatC 11s ease-in-out infinite', animationDelay: '-4.5s' }} viewBox="0 0 60 80" fill="none">
      <rect x="24" y="4" width="12" height="30" rx="6" fill="#EF5A2C" />
      <rect x="20" y="28" width="20" height="10" rx="4" fill="#F6AC41" />
      <rect x="18" y="38" width="24" height="6" rx="2" fill="#EF5A2C" />
      <line x1="30" y1="44" x2="30" y2="58" stroke="#F6AC41" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="30" cy="64" rx="18" ry="5" fill="#F6AC41" opacity="0.5" />
      <circle cx="30" cy="15" r="4" fill="#FFF" opacity="0.5" />
    </svg>

  </div>
);

// ── Inner layout (needs to be inside <Router> for useLocation) ──
const AppLayout = () => {
  const location = useLocation();
  const path = location.pathname;
  const isPublicStudentSurface = path === '/' || path === '/submit' || path.startsWith('/submit/');

  return (
    <>
      <BgCanvas />
      <div className="app-container">
        <nav className="navbar">
          <Link to="/" className="navbar-brand">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="WizKlub Futurz" style={{ height: '80px', display: 'block' }} />
          </Link>
          {/* No admin entry on public student pages (only personal links open the form) */}
          {!isPublicStudentSurface && (
            <div>
              <Link to="/admin" className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                Admin Access
              </Link>
            </div>
          )}
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/*" element={<AdminDashboard />} />
            <Route path="/submit/:studentId/:exp/:sig" element={<SubmissionForm />} />
            <Route path="/submit" element={<HomeGate />} />
            <Route path="/" element={<HomeGate />} />
            <Route path="*" element={<HomeGate />} />
          </Routes>
        </main>
      </div>
    </>
  );
};

function App() {
  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || undefined;
  return (
    <Router basename={basename}>
      <ToastContainer
        position="top-right"
        autoClose={6000}
        limit={4}
        newestOnTop
        closeOnClick={false}
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        style={{ zIndex: 10050 }}
        toastStyle={{
          fontFamily: 'Inter, system-ui, sans-serif',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
        }}
      />
      <AppLayout />
    </Router>
  );
}

export default App;
