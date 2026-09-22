import React from 'react';
import logoWhite from '../../assets/wizklub-logo-white.png';
import authBg from '../../assets/wiz-auth-bg.svg';

/**
 * student.infinitylearn.com auth split in WizKlub colours (same pattern as the Teachers Portal login):
 * orange doodle brand half (white logo, large copy only) + white panel with a 40px curved edge.
 * < 1024px the brand block sits on top and the panel becomes a bottom sheet.
 */
export default function AuthLayout({ tagline = 'Kit Inventory', sub, wide = false, children }) {
  return (
    <div className="inv-auth">
      <section
        className="inv-auth-brand"
        aria-label="WizKlub Futurz"
        style={{ '--wk-auth-bg': `url("${authBg}")` }}
      >
        <img
          src={logoWhite}
          alt="WizKlub Futurz — An Infinity Learn initiative"
          className="inv-auth-brand__logo"
        />
        <p className="inv-auth-brand__tagline">{tagline}</p>
        {sub && <p className="inv-auth-brand__sub">{sub}</p>}
      </section>

      <section className="inv-auth-panel">
        <div className={`inv-auth-col ${wide ? 'inv-auth-col--wide' : ''}`}>{children}</div>
      </section>
    </div>
  );
}
