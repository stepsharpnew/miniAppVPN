import styles from "./BottomNav.module.css";

export type TabId = "home" | "pricing" | "instructions" | "faq";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: "home", label: "Главная", icon: "🏠" },
  { id: "pricing", label: "Тарифы", icon: "🛒" },
  { id: "instructions", label: "Инструкции", icon: "📖" },
  { id: "faq", label: "FAQ", icon: "💬" },
];

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className={styles.nav}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tab} ${activeTab === tab.id ? styles.active : ""}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className={styles.icon}>{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
