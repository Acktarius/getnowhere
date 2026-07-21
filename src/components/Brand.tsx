type Props = { size?: number; className?: string };

export function BrandMark({ size = 40, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden="true"
    >
      <rect width="512" height="512" rx="128" fill="var(--bg-elev-2)" />
      <circle
        cx="256"
        cy="256"
        r="188"
        stroke="var(--secondary)"
        strokeWidth="22"
        fill="none"
        opacity="0.5"
      />
      <circle
        cx="256"
        cy="256"
        r="128"
        stroke="var(--primary)"
        strokeWidth="22"
        fill="none"
      />
      <rect
        x="238"
        y="176"
        width="36"
        height="78"
        rx="18"
        fill="var(--primary)"
      />
      <circle cx="256" cy="292" r="19" fill="var(--primary)" />
    </svg>
  );
}

export function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand-wordmark ${large ? "brand-wordmark--lg" : ""}`}>
      Get Now <span className="brand-wordmark__accent">Here</span>
    </span>
  );
}
