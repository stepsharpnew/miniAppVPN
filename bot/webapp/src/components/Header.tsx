import { useTelegramUser } from '../hooks/useTelegramUser';
import { BRAND_NAME } from '../../../shared/texts';
import styles from './Header.module.css';

export function Header() {
  const user = useTelegramUser();

  return (
    <header className={styles.header}>
      <div className={styles.userInfo}>
        {user.photoUrl ? (
          <img
            className={styles.avatar}
            src={user.photoUrl}
            alt={user.firstName}
          />
        ) : (
          <div className={styles.avatarPlaceholder}>
            {user.firstName.charAt(0)}
          </div>
        )}
        <div className={styles.userText}>
          <span className={styles.username}>{user.firstName}</span>
          <span className={styles.userId}>ID: {user.id || '—'}</span>
        </div>
      </div>
      <span className={styles.brand}>{BRAND_NAME}</span>
    </header>
  );
}
