import styles from './Preloader.module.css';

interface PreloaderProps {
  visible: boolean;
}

export function Preloader({ visible }: PreloaderProps) {
  return (
    <div className={`${styles.overlay} ${visible ? '' : styles.hidden}`}>
      <div className={`${styles.blob} ${styles.blob1}`} />
      <div className={`${styles.blob} ${styles.blob2}`} />
      <div className={`${styles.blob} ${styles.blob3}`} />

      <div className={styles.content}>
        <div className={styles.shield}>
          <span className={styles.shieldIcon}>🛡️</span>
        </div>
        <span className={styles.brand}>MEME VPN</span>
        <div className={styles.spinner} />
        <span className={styles.subtitle}>Загрузка</span>
      </div>
    </div>
  );
}
