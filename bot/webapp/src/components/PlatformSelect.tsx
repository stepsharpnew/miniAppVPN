import type { PlatformId, PlatformInfo } from "../../../shared/platforms";
import styles from "./PlatformSelect.module.css";

interface PlatformSelectProps {
  platforms: PlatformInfo[];
  selectedId: PlatformId;
  onSelect: (platform: PlatformInfo) => void;
}

export function PlatformSelect({
  platforms,
  selectedId,
  onSelect,
}: PlatformSelectProps) {
  return (
    <div className={styles.grid}>
      {platforms.map((p) => (
        <button
          key={p.id}
          className={`${styles.card} ${selectedId === p.id ? styles.selected : ""}`}
          onClick={() => onSelect(p)}
        >
          <span className={styles.icon}>{p.icon}</span>
          <span className={styles.name}>{p.name}</span>
        </button>
      ))}
    </div>
  );
}
