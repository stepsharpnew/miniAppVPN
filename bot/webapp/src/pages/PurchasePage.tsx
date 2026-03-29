import { Header } from "../components/Header";
import styles from "./PurchasePage.module.css";

interface PurchasePageProps {
  active: boolean;
  onGoToProfile: () => void;
}

export function PurchasePage({ active, onGoToProfile }: PurchasePageProps) {
  return (
    <>
      <Header />

      <section className={styles.section}>
        <div className={styles.redirectCard}>
          <span className={styles.redirectIcon}>👤</span>
          <p className={styles.redirectTitle}>
            Покупка и продление — в Профиле
          </p>
          <p className={styles.redirectHint}>
            Выберите тариф, оплатите и получите конфиг — всё в одном месте.
          </p>
          {active && (
            <button className={styles.redirectBtn} onClick={onGoToProfile}>
              Перейти в Профиль
            </button>
          )}
        </div>
      </section>
    </>
  );
}
