import { useCallback, useState } from 'react';
import { useTelegramUser } from '../hooks/useTelegramUser';
import { StatusBadge } from '../components/StatusBadge';
import { BRAND_NAME } from '../../../shared/texts';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const user = useTelegramUser();
  const [copied, setCopied] = useState(false);

  const configLink = '—';
  const isActive = false;

  const handleCopy = useCallback(() => {
    if (configLink && configLink !== '—') {
      navigator.clipboard.writeText(configLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [configLink]);

  return (
    <div className={styles.page}>
      <div className={styles.userCard}>
        {user.photoUrl ? (
          <img
            src={user.photoUrl}
            alt={user.firstName}
            className={styles.avatar}
          />
        ) : (
          <div className={`${styles.avatar} ${styles.avatarPlaceholder}`}>
            {user.firstName.charAt(0)}
          </div>
        )}
        <div className={styles.userName}>
          {user.firstName} {user.lastName}
        </div>
        <div className={styles.userId}>ID: {user.id || '—'}</div>
      </div>

      <div className={styles.subCard}>
        <div className={styles.sectionHeader}>Статус подписки</div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Статус:</span>
          <StatusBadge active={isActive} />
        </div>

        <div className={styles.divider} />

        <div className={styles.row}>
          <span className={styles.rowLabel}>Тариф:</span>
          <span className={styles.rowValue}>—</span>
        </div>

        <div className={styles.divider} />

        <div className={styles.row}>
          <span className={styles.rowLabel}>Действует до:</span>
          <span className={styles.rowValue}>—</span>
        </div>

        <div className={styles.divider} />

        <div className={styles.row}>
          <span className={styles.rowLabel}>Конфиг:</span>
          <button className={styles.copyBtn} onClick={handleCopy}>
            {copied ? '✓ Скопировано' : '📋 Копировать'}
          </button>
        </div>
      </div>

      <div className={styles.infoCard}>
        <div className={styles.infoText}>
          После оплаты менеджер отправит конфиг прямо в бот {BRAND_NAME}.
          Он также появится здесь в разделе «Профиль».
        </div>
      </div>
    </div>
  );
}
