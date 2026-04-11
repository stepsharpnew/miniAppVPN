import { BRAND_NAME } from "../data/plans";
import { StatusBadge } from "../components/StatusBadge";
import styles from "./HomePage.module.css";

interface HomePageProps {
  onNavigate: (tab: "pricing") => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.brand}>{BRAND_NAME}</div>
        <div className={styles.tagline}>
          Быстрый и безопасный VPN
          <br />
          без ограничений
        </div>
        <button className={styles.ctaBtn} onClick={() => onNavigate("pricing")}>
          Подключить VPN
        </button>
      </div>

      <div className={styles.features}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>⚡</div>
          <div className={styles.featureTitle}>Высокая скорость</div>
          <div className={styles.featureText}>
            Серверы на современном оборудовании без троттлинга
          </div>
        </div>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>🛡️</div>
          <div className={styles.featureTitle}>AmneziaWG</div>
          <div className={styles.featureText}>
            Протокол нового поколения — не определяется DPI
          </div>
        </div>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>📱</div>
          <div className={styles.featureTitle}>Все платформы</div>
          <div className={styles.featureText}>
            Android, iOS, Windows, macOS, Linux
          </div>
        </div>
      </div>

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

        <div className={styles.authHint}>
          Регистрация и авторизация — скоро!
          <br />
          <span className={styles.authHintSub}>
            Оплачивайте через Telegram-бот или дождитесь веб-кабинета
          </span>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>99.9%</div>
          <div className={styles.statLabel}>Аптайм</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>от 150₽</div>
          <div className={styles.statLabel}>в месяц</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>24/7</div>
          <div className={styles.statLabel}>Поддержка</div>
        </div>
      </div>
    </div>
  );
}
