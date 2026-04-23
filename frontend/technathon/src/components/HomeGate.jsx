/** Public landing: no open form; students need organiser link. Doc: ../../../docs/file-notes/client/src/components/HomeGate.jsx.md */
import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';

const HomeGate = () => (
  <div className="card animate-fade-in" style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center', padding: '3rem 2rem' }}>
    <h1 style={{ background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '1rem' }}>
      Technathon 2026
    </h1>
    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
      There is <strong>no open submission form</strong> on this site. Submissions are only accepted through your <strong>personal link</strong> from the organiser. Each link is tied to one student ID — you cannot use another student&apos;s link or change ID on the form.
    </p>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--color-brand-dark-1)', fontWeight: 600, marginBottom: '2rem' }}>
      <Mail size={20} />
      <span>Check your email or message from WizKlub for your submission URL.</span>
    </div>
    <Link to="/admin/login" className="btn btn-secondary" style={{ fontSize: '0.875rem' }}>
      Admin login
    </Link>
  </div>
);

export default HomeGate;
