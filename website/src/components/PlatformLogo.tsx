import type { PlatformId } from "../data/platforms";

interface PlatformLogoProps {
  platformId: PlatformId;
  size?: number;
  className?: string;
}

export function PlatformLogo({ platformId, size = 28, className }: PlatformLogoProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    preserveAspectRatio: "xMidYMid meet",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className,
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  switch (platformId) {
    case "android":
      return (
        <svg {...common}>
          <path
            d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 00-.83.22l-1.88 3.24a11.463 11.463 0 00-8.94 0L5.65 5.67c-.16-.31-.54-.43-.85-.27-.31.16-.43.54-.27.85L6.4 9.48C3.3 11.25 1.28 14.44 1 18h22c-.28-3.56-2.3-6.75-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"
            fill="currentColor"
          />
        </svg>
      );

    case "ios":
    case "macos":
      return (
        <svg {...common}>
          <path
            d="M16.9 12.7c0-2 1.7-3 1.8-3.1-1-1.4-2.5-1.6-3.1-1.6-1.3-.1-2.5.8-3.2.8-.6 0-1.6-.8-2.7-.8-1.4 0-2.7.8-3.4 2-1.5 2.5-.4 6.2 1 8.2.7 1 1.6 2.1 2.7 2 .9 0 1.3-.6 2.6-.6 1.2 0 1.6.6 2.7.6 1.2 0 2-.9 2.7-1.9.8-1.1 1.1-2.2 1.1-2.2-.1 0-2.2-.9-2.2-3.4Z"
            fill="currentColor"
          />
          <path
            d="M14.6 6.6c.6-.7 1-1.7.9-2.7-.9.1-2 .6-2.6 1.3-.6.7-1 1.7-.9 2.7 1 .1 2-.5 2.6-1.3Z"
            fill="currentColor"
          />
        </svg>
      );

    case "windows":
      return (
        <svg {...common}>
          <path d="M3 5.2 10.6 4v7H3V5.2Z" fill="currentColor" />
          <path d="M11.4 3.9 21 2.5V11h-9.6V3.9Z" fill="currentColor" />
          <path d="M3 12h7.6v7L3 17.8V12Z" fill="currentColor" />
          <path d="M11.4 12H21v8.5l-9.6-1.4V12Z" fill="currentColor" />
        </svg>
      );

    case "linux":
    default:
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2c1.93 0 3.68.78 4.95 2.05l-1.41 1.41A5.022 5.022 0 0012 6c-2.76 0-5 2.24-5 5s2.24 5 5 5a4.98 4.98 0 003.54-1.46l1.41 1.41A7.96 7.96 0 0112 20c-4.41 0-8-3.59-8-8s3.59-8 8-8z"
            fill="currentColor"
          />
        </svg>
      );
  }
}
