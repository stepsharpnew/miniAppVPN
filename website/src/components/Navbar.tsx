import { useState } from "react";
import { BRAND_NAME } from "../data/plans";
import styles from "./Navbar.module.css";

export type TabId = "profile" | "pricing" | "instructions" | "support" | "faq";

interface NavItem {
  id: TabId;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "profile", label: "Профиль" },
  { id: "pricing", label: "Тарифы" },
  { id: "instructions", label: "Инструкции" },
  { id: "support", label: "Поддержка" },
  { id: "faq", label: "FAQ" },
];

interface NavbarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function Navbar({ activeTab, onTabChange }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNav = (id: TabId) => {
    onTabChange(id);
    setMenuOpen(false);
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.inner}>
        <button className={styles.logo} onClick={() => handleNav("profile")}>
          <span className={styles.logoIcon}>🛡️</span>
          <span className={styles.logoText}>{BRAND_NAME}</span>
        </button>

        <div className={styles.desktopLinks}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`${styles.navLink} ${activeTab === item.id ? styles.active : ""}`}
              onClick={() => handleNav(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          className={`${styles.burger} ${menuOpen ? styles.burgerOpen : ""}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Меню"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {menuOpen && (
        <div className={styles.mobileMenu}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`${styles.mobileLink} ${activeTab === item.id ? styles.active : ""}`}
              onClick={() => handleNav(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
