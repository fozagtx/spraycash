/** Spraycash mark: a dollar coin with pay spraying off it, a droplet for every second. */
export function LogoMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <circle cx="13" cy="19" r="11" fill="var(--accent, #0F6B4F)" />
      <path
        d="M16.6 14.6c-.6-1.1-1.9-1.8-3.6-1.8-2.1 0-3.6 1.1-3.6 2.7 0 1.7 1.4 2.3 3.6 2.8 2.3.5 3.9 1.2 3.9 3.1 0 1.8-1.7 3-4 3-1.9 0-3.4-.8-4.1-2.2M13 10.6v2.2M13 25.3v2"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="26.6" cy="6.6" r="2.6" fill="var(--accent, #0F6B4F)" />
      <circle cx="30" cy="12.6" r="1.6" fill="var(--accent, #0F6B4F)" opacity="0.7" />
      <circle cx="20.8" cy="2.6" r="1.6" fill="var(--accent, #0F6B4F)" opacity="0.7" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">
        Spray<em>cash</em>
      </span>
    </span>
  );
}
