import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Lock,
  Rocket,
  Users,
} from 'lucide-react';
import { ROLE_PORTALS } from '../utils/routes';
import AuthLayout from '../components/auth/AuthLayout';

const LANDING_PORTALS = ROLE_PORTALS.filter((portal) => portal.role !== 'School');

const PORTAL_COPY = {
  Admin: {
    tagline: 'Operations Command Center',
    description:
      'Manage schools, divisions, inventory, replacements, and global reports with full administrative control.',
  },
  AM: {
    tagline: 'Division Oversight',
    description:
      'Monitor schools in your division, review audits, and approve replacements for streamlined operations.',
  },
};

const FEATURES = [
  {
    icon: Lock,
    title: 'Secure and reliable',
    description: 'Enterprise-grade security to keep your data protected.',
  },
  {
    icon: Rocket,
    title: 'Built for efficiency',
    description: 'Streamlined workflows to save time and improve productivity.',
  },
  {
    icon: Users,
    title: 'Role-specific dashboards',
    description: 'Everything you need, tailored to your responsibilities.',
  },
  {
    icon: BarChart3,
    title: 'Real-time insights',
    description: 'Make informed decisions with up-to-date reports.',
  },
];

const PORTAL_TONES = {
  Admin: 'bg-wk-peach text-wk-orange-text',
  AM: 'bg-info-50 text-info-600',
};

const Landing = () => {
  return (
    <AuthLayout
      tagline="Kit Inventory"
      sub="Dispatch, receipt, monthly audits and replacements for every WizKlub school kit."
      wide
    >
      <h1 className="inv-auth-title">Choose your portal</h1>
      <p className="inv-auth-subtitle">
        Each role has its own secure sign-in and a dashboard built for your work.
      </p>

      <nav className="mt-8 flex flex-col gap-3" aria-label="Portals">
        {LANDING_PORTALS.map((portal) => {
          const Icon = portal.icon;
          const copy = PORTAL_COPY[portal.role] || {};
          return (
            <Link key={portal.role} to={portal.path} className="inv-choice group">
              <span className={`inv-choice__art ${PORTAL_TONES[portal.role] || 'bg-wk-peach text-wk-orange-text'}`}>
                <Icon size={26} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="inv-choice__name">{portal.label}</span>
                <span className="inv-choice__meta">{copy.description || portal.description}</span>
              </span>
              <span className="inv-choice__go">
                <span className="hidden sm:inline">Sign in</span>
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="mt-8 grid grid-cols-1 gap-4 rounded-2xl bg-wk-cream p-5 sm:grid-cols-2" aria-label="Why this portal">
        {FEATURES.map(({ icon, title, description }) => {
          const FeatureIcon = icon;
          return (
          <div key={title} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-wk-orange-text">
              <FeatureIcon size={18} strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-wk-ink">{title}</h2>
              <p className="mt-0.5 text-[13px] leading-snug text-wk-body">{description}</p>
            </div>
          </div>
        );
        })}
      </section>

      <footer className="mt-8 flex flex-col items-center justify-between gap-3 text-[13px] text-wk-muted sm:flex-row">
        <p className="m-0">© {new Date().getFullYear()} WizKlub. All rights reserved.</p>
        <div className="flex gap-5">
          <a href="#privacy" className="hover:text-wk-orange-text">Privacy Policy</a>
          <a href="#terms" className="hover:text-wk-orange-text">Terms of Service</a>
          <a href="#support" className="hover:text-wk-orange-text">Support</a>
        </div>
      </footer>
    </AuthLayout>
  );
};

export default Landing;
