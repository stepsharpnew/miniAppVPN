import { useState, useEffect } from "react";
import { BRAND_NAME } from "../data/plans";
import logoImg from "../photo_2026-04-11_16-38-41.jpg";
import styles from "./Navbar.module.css";

export type TabId = "profile" | "pricing" | "instructions" | "support";

interface NavItem {
  id: TabId;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "profile", label: "Профиль" },
  { id: "pricing", label: "Тарифы" },
  { id: "instructions", label: "Инструкции" },
  { id: "support", label: "Поддержка" },
];

interface NavbarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function Navbar({ activeTab, onTabChange }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const handleNav = (id: TabId) => {
    onTabChange(id);
    setMenuOpen(false);
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.inner}>
        <button type="button" className={styles.logo} onClick={() => handleNav("profile")}>
          <img src={logoImg} alt="" className={styles.logoImg} width={36} height={36} />
          <span className={styles.logoText}>{BRAND_NAME}</span>
        </button>

        <div className={styles.desktopLinks}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.navLink} ${activeTab === item.id ? styles.active : ""}`}
              onClick={() => handleNav(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`${styles.burger} ${menuOpen ? styles.burgerOpen : ""}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Меню"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            className={styles.mobileBackdrop}
            aria-label="Закрыть меню"
            onClick={() => setMenuOpen(false)}
          />
          <div className={styles.mobileMenu}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.mobileLink} ${activeTab === item.id ? styles.active : ""}`}
                onClick={() => handleNav(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
