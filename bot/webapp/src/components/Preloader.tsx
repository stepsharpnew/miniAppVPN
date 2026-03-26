import styles from './Preloader.module.css';
import { Player } from "@lottiefiles/react-lottie-player";

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
        <div className={styles.lottie}>
          <Player
            autoplay
            loop
            src="/preloader.json"
            style={{ width: 120, height: 120 }}
          />
        </div>
        <span className={styles.brand}>MEME VPN</span>
        <span className={styles.subtitle}>Загрузка</span>
      </div>
    </div>
  );
}
