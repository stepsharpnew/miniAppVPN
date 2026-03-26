import type { PlatformId } from "../../../shared/platforms";

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
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className,
    "aria-hidden": true as const,
    focusable: "false" as const,
  };

  switch (platformId) {
    case "android":
      // Simplified Android robot
      return (
        <svg {...common}>
          <path
            d="M7.2 9.3c-.8 0-1.45.66-1.45 1.48v5.9c0 .82.65 1.48 1.45 1.48h.65v1.55c0 .72.58 1.3 1.3 1.3s1.3-.58 1.3-1.3v-1.55h2.1v1.55c0 .72.58 1.3 1.3 1.3s1.3-.58 1.3-1.3v-1.55h.65c.8 0 1.45-.66 1.45-1.48v-5.9c0-.82-.65-1.48-1.45-1.48H7.2Z"
            fill="currentColor"
          />
          <path
            d="M9.05 7.7 7.85 6.2a.6.6 0 0 1 .94-.75l1.3 1.6a6.4 6.4 0 0 1 3.82 0l1.3-1.6a.6.6 0 1 1 .94.75l-1.2 1.5c1.7.9 2.85 2.55 2.85 4.45H6.2c0-1.9 1.15-3.55 2.85-4.45Z"
            fill="currentColor"
          />
          <circle cx="9.6" cy="11.2" r="0.7" fill="#0A0A1A" />
          <circle cx="14.4" cy="11.2" r="0.7" fill="#0A0A1A" />
        </svg>
      );

    case "ios":
    case "macos":
      // Minimal Apple mark (bitten apple silhouette)
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
      // Windows 4 panes
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
      // Simple penguin head
      return (
        <svg {...common}>
          <path
            d="M12 3.2c-3.2 0-5.6 2.6-5.6 6 0 1.4.4 2.7 1.1 3.8-.2.7-.4 1.5-.4 2.3 0 2.9 2.1 5.3 4.9 5.3h0c2.8 0 4.9-2.4 4.9-5.3 0-.8-.1-1.6-.4-2.3.7-1.1 1.1-2.4 1.1-3.8 0-3.4-2.4-6-5.6-6Z"
            fill="currentColor"
          />
          <path
            d="M12 9.6c-1.4 0-2.6 1.1-2.6 2.6 0 1.1.6 2.1 1.6 2.4-.2.9-.8 1.7-1.6 2.2.8.8 1.7 1.2 2.6 1.2s1.8-.4 2.6-1.2c-.8-.5-1.4-1.3-1.6-2.2 1-.3 1.6-1.3 1.6-2.4 0-1.5-1.1-2.6-2.6-2.6Z"
            fill="#0A0A1A"
            opacity="0.35"
          />
          <circle cx="10.6" cy="11.6" r="0.6" fill="#0A0A1A" />
          <circle cx="13.4" cy="11.6" r="0.6" fill="#0A0A1A" />
          <path d="M12 13.3 11.1 14.3h1.8L12 13.3Z" fill="#F5C542" />
        </svg>
      );
  }
}

