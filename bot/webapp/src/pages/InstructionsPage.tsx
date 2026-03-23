import { Accordion } from '../components/Accordion';
import { PLATFORMS } from '../../../shared/platforms';
import styles from './InstructionsPage.module.css';

export function InstructionsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroIcon}>📖</div>
        <div>
          <div className={styles.heroTitle}>Инструкции</div>
          <div className={styles.heroSubtitle}>
            Настройка AmneziaWG на вашем устройстве
          </div>
        </div>
      </div>

      <div className={styles.accordions}>
        {PLATFORMS.map((platform) => (
          <Accordion
            key={platform.id}
            icon={platform.icon}
            title={platform.name}
            iconColor="rgba(0,200,83,0.15)"
          >
            <ol>
              {platform.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>

            <a
              href={platform.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.downloadBtn}
            >
              📥 Скачать AmneziaWG
            </a>

            {platform.videoGuideUrl && (
              <a
                href={platform.videoGuideUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.videoLink}
              >
                🎬 Видео-гайд
              </a>
            )}
          </Accordion>
        ))}
      </div>

      <div className={styles.helpCard}>
        <div className={styles.helpTitle}>Нужна помощь?</div>
        <div className={styles.helpText}>
          Если у вас возникли проблемы с настройкой, обратитесь в службу
          поддержки через раздел «Поддержка»
        </div>
      </div>
    </div>
  );
}
