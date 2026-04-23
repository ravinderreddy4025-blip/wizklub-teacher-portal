/** Admin JWT login form → POST /api/admin/login. Doc: ../../../docs/file-notes/client/src/components/AdminLogin.jsx.md */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader } from 'lucide-react';
import { API_BASE, API_BASE_HINT } from '../apiConfig';
import { formatNetworkError, notifyError } from '../utils/toastNotify';

const AdminLogin = () => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loading, setLoading]         = useState(false);
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(credentials),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON body */
      }

      if (!res.ok) {
        if (res.status === 429) {
          notifyError('Too many login attempts. Please wait about 15 minutes and try again.', { toastId: 'login-429' });
        } else {
          notifyError(data.message || 'Invalid credentials. Please try again.', { toastId: 'login-auth' });
        }
        return;
      }

      const expiresAt = Date.now() + (data.expiresIn * 1000);
      localStorage.setItem('adminToken',     data.token);
      localStorage.setItem('adminTokenExp',  expiresAt.toString());

      navigate('/admin/dashboard');
    } catch (err) {
      notifyError(
        formatNetworkError(err?.message, API_BASE_HINT, 'reach the login server'),
        { toastId: 'login-network' }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(246, 172, 65, 0.1)', borderRadius: '50%', marginBottom: '1rem' }}>
            <Lock style={{ color: 'var(--color-brand-dark-1)' }} size={32} />
          </div>
          <h2 style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Admin Access
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Sign in to view and manage submissions
          </p>
        </div>

        <form onSubmit={handleLogin} id="admin-login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="login-username">Username</label>
            <input
              id="login-username"
              type="text"
              name="username"
              className="form-control"
              value={credentials.username}
              onChange={handleInputChange}
              autoComplete="username"
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              name="password"
              className="form-control"
              value={credentials.password}
              onChange={handleInputChange}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>
          <button
            id="login-submit-btn"
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Signing in...
              </>
            ) : (
              <>
                <Lock size={16} />
                Secure Login
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
