import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  LayoutGrid,
  Lock,
  Rocket,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { ROLE_PORTALS } from '../utils/routes';
import BrandLogo from '../components/brand/BrandLogo';

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
    title: 'Secure & Reliable',
    description: 'Enterprise-grade security to keep your data protected.',
  },
  {
    icon: Rocket,
    title: 'Built for Efficiency',
    description: 'Streamlined workflows to save time and improve productivity.',
  },
  {
    icon: Users,
    title: 'Role-Specific Dashboards',
    description: 'Everything you need, tailored to your responsibilities.',
  },
  {
    icon: BarChart3,
    title: 'Real-time Insights',
    description: 'Make informed decisions with up-to-date reports.',
  },
];

const Landing = () => {
  return (
    <div className="landing-shell flex min-h-screen flex-col">
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-8 lg:px-10">
        <BrandLogo className="h-9 w-auto max-w-[160px] md:h-10 md:max-w-[180px]" />
        <span className="landing-chip-cta hidden sm:inline-flex">Educators | Kit Management</span>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-8 md:px-8 md:pt-12 lg:px-10">
        <section className="mx-auto mb-14 max-w-3xl animate-fade-in text-center md:mb-16">
          <div className="landing-chip-accent mb-6">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--stitch-primary)]" />
            </span>
            Wizklub — An Innovation Platform for Kids
          </div>

          <h1 className="mb-6 font-heading text-4xl font-bold tracking-tight text-[#1F2937] md:text-5xl">
            Choose your portal <span className="text-[var(--stitch-primary)]">to get started</span>
          </h1>

          <p className="mx-auto max-w-2xl text-base leading-relaxed text-[#6B7280] md:text-lg">
            Select the role that matches your work. Each portal has its own secure sign-in and a
            dedicated dashboard tailored to your team.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <span className="landing-chip">
              <ShieldCheck size={14} className="text-[var(--stitch-primary)]" />
              Secure role-based access
            </span>
            <span className="landing-chip">
              <LayoutGrid size={14} className="text-[var(--stitch-primary)]" />
              {LANDING_PORTALS.length} portals available
            </span>
          </div>
        </section>

        <section className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
          {LANDING_PORTALS.map((portal, index) => {
            const Icon = portal.icon;
            const copy = PORTAL_COPY[portal.role] || {};
            return (
              <Link
                key={portal.role}
                to={portal.path}
                className="landing-portal-card group animate-slide-up"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-[var(--stitch-primary)]">
                  <Icon size={24} strokeWidth={1.75} />
                </div>

                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--stitch-primary)]">
                  {copy.tagline || portal.tagline}
                </p>
                <h2 className="mb-4 text-2xl font-bold text-[#1F2937] transition-colors group-hover:text-[var(--stitch-primary)]">
                  {portal.label}
                </h2>
                <p className="mb-8 flex-1 text-sm leading-relaxed text-[#6B7280]">
                  {copy.description || portal.description}
                </p>

                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--stitch-primary)]">
                  Sign in to portal
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            );
          })}
        </section>

        <section id="features" className="mt-16">
          <div className="landing-features-bar">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[var(--stitch-primary)]">
                  <Icon size={16} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#1F2937]">{title}</h3>
                  <p className="mt-1 text-[11px] leading-tight text-[#6B7280]">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-gray-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 md:flex-row md:px-8 lg:px-10">
          <p className="text-xs text-[#6B7280]">
            © {new Date().getFullYear()} Wizklub. All rights reserved.
          </p>
          <div className="flex gap-6 text-xs text-[#6B7280]">
            <a href="#privacy" className="transition-colors hover:text-[var(--stitch-primary)]">Privacy Policy</a>
            <a href="#terms" className="transition-colors hover:text-[var(--stitch-primary)]">Terms of Service</a>
            <a href="#support" className="transition-colors hover:text-[var(--stitch-primary)]">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
