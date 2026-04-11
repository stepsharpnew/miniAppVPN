import { BRAND_NAME } from "../data/plans";
import { StatusBadge } from "../components/StatusBadge";
import styles from "./ProfilePage.module.css";

interface ProfilePageProps {
  onNavigate: (tab: "pricing") => void;
}

export function ProfilePage({ onNavigate }: ProfilePageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.profileCard}>
        <div className={styles.profileTop}>
          <div className={styles.avatarPlaceholder}>?</div>
          <div className={styles.profileMeta}>
            <div className={styles.userName}>Гость</div>
            <div className={styles.userId}>Войдите для доступа к профилю</div>
          </div>
          <div className={styles.statusWrap}>
            <div className={styles.statusLabel}>Подписка</div>
            <StatusBadge active={false} />
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.configBlock}>
          <div className={styles.sectionHeader}>VPN конфиг</div>
          <div className={styles.noConfig}>
            После оплаты конфиг появится здесь.
            <br />
            Оплатите через сайт или Telegram-бот {BRAND_NAME}.
          </div>
        </div>
      </div>

      <div className={styles.authCard}>
        <div className={styles.authIcon}>🔐</div>
        <div className={styles.authTitle}>Вход и регистрация</div>
        <div className={styles.authText}>
          Авторизация через email — скоро!
          <br />
          Пока вы можете оплатить подписку через Telegram-бот.
        </div>
        <div className={styles.authButtons}>
          <button className={styles.authBtnPrimary} disabled>
            Войти по email
          </button>
          <button
            className={styles.authBtnSecondary}
            onClick={() => onNavigate("pricing")}
          >
            Посмотреть тарифы
          </button>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>⚡</div>
          <div className={styles.statLabel}>Высокая скорость</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>🛡️</div>
          <div className={styles.statLabel}>AmneziaWG</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>📱</div>
          <div className={styles.statLabel}>Все платформы</div>
        </div>
      </div>
    </div>
  );
}
