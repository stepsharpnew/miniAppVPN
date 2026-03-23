import styles from './BottomNav.module.css';

export type TabId = 'purchase' | 'profile' | 'instructions' | 'support';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: 'purchase', label: 'Покупка', icon: '🛒' },
  { id: 'profile', label: 'Профиль', icon: '👤' },
  { id: 'instructions', label: 'Инструкции', icon: '📖' },
  { id: 'support', label: 'Поддержка', icon: '💬' },
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
          className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className={styles.icon}>{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
