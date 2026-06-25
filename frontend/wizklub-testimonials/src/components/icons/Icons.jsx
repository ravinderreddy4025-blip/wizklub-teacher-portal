export function IconMenu({ className, size = 18 }) {
  return (
    <svg className={className} width={size} height={size * 0.67} viewBox="0 0 18 12" fill="none">
      <path d="M0 1h18M0 6h18M0 11h18" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function IconBack({ className, size = 16 }) {
  return (
    <svg className={className} width={size * 0.5} height={size} viewBox="0 0 8 16" fill="none">
      <path d="M7 1L1 8l6 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconChevronRight({ className, size = 12 }) {
  return (
    <svg className={className} width={size * 0.62} height={size} viewBox="0 0 7.4 12" fill="none">
      <path d="M1 1l5.4 5-5.4 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconRefresh({ className, size = 18 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

export function IconMore({ className, size = 16 }) {
  return (
    <svg className={className} width={size * 0.25} height={size} viewBox="0 0 4 16" fill="currentColor">
      <circle cx="2" cy="2" r="2" />
      <circle cx="2" cy="8" r="2" />
      <circle cx="2" cy="14" r="2" />
    </svg>
  )
}

export function IconHome({ className, size = 18 }) {
  return (
    <svg className={className} width={size * 0.89} height={size} viewBox="0 0 16 18" fill="none">
      <path
        d="M1 7l7-6 7 6v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconSchools({ className, size = 18 }) {
  return (
    <svg className={className} width={size * 1.22} height={size} viewBox="0 0 22 18" fill="none">
      <path d="M11 1L1 6v2h2v7h16V8h2V6L11 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 15V10h8v5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function IconUpload({ className, size = 16 }) {
  return (
    <svg className={className} width={size * 1.38} height={size} viewBox="0 0 22 16" fill="none">
      <path d="M11 1v10M7 5l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1 14h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconProfile({ className, size = 16 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 15c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function IconSearch({ className, size = 18 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconUsers({ className, size = 20 }) {
  return (
    <svg className={className} width={size} height={size * 0.5} viewBox="0 0 20 10" fill="none">
      <circle cx="5" cy="3" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="15" cy="3" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M0 10c0-2.8 2.2-5 5-5s5 2.2 5 5M10 10c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function IconTrendUp({ className, size = 12 }) {
  return (
    <svg className={className} width={size} height={size * 0.6} viewBox="0 0 12 7" fill="none">
      <path d="M1 6l4-4 3 2 3-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function IconAlert({ className, size = 12 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 3v4M6 9h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function IconCamera({ className, size = 22 }) {
  return (
    <svg className={className} width={size} height={size * 0.91} viewBox="0 0 22 20" fill="none">
      <path
        d="M2 6h3l2-3h10l2 3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function IconPlus({ className, size = 19 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 19 19" fill="none">
      <path d="M9.5 1v17M1 9.5h17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconPlay({ className, size = 11 }) {
  return (
    <svg className={className} width={size} height={size * 1.27} viewBox="0 0 11 14" fill="currentColor">
      <path d="M0 0l11 7-11 7V0z" />
    </svg>
  )
}

export function IconCloudSync({ className, size = 15 }) {
  return (
    <svg className={className} width={size * 1.1} height={size * 0.71} viewBox="0 0 16.5 10.7" fill="none">
      <path
        d="M12 6.7a3 3 0 0 0-5.8-1A2.5 2.5 0 1 0 4 10h8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M10 8l1.5 1.5L14 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function IconExternalLink({ className, size = 18 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M7 3H3v12h12V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 1h6v6M17 1L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconBell({ className, size = 16 }) {
  return (
    <svg className={className} width={size} height={size * 1.25} viewBox="0 0 16 20" fill="none">
      <path
        d="M8 2a5 5 0 0 1 5 5v4l2 2H1l2-2V7a5 5 0 0 1 5-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6.5 18a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
