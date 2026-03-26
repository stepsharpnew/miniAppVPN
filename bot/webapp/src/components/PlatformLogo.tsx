import type { PlatformId } from "../../../shared/platforms";
import androidLogoUrl from "../assets/icons8-android-os.svg?url";
import ubuntuLogoUrl from "../assets/ubuntu-svgrepo-com (1).svg?url";

interface PlatformLogoProps {
  platformId: PlatformId;
  size?: number;
  className?: string;
}

export function PlatformLogo({ platformId, size = 28, className }: PlatformLogoProps) {
  const imgCommon = {
    width: size,
    height: size,
    className,
    draggable: false,
    loading: "lazy" as const,
    style: { width: size, height: size, objectFit: "contain" as const },
    alt: "",
  };

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
      return <img src={androidLogoUrl} {...imgCommon} />;

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
      return <img src={ubuntuLogoUrl} {...imgCommon} />;
  }
}

