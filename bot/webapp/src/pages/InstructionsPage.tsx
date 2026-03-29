import { Accordion } from "../components/Accordion";
import { PLATFORMS } from "../../../shared/platforms";
import { PlatformLogo } from "../components/PlatformLogo";
import { PLATFORM_INSTRUCTION_PDF } from "./instructionPdfs";
import styles from "./InstructionsPage.module.css";

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
            icon={<PlatformLogo platformId={platform.id} size={18} />}
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

            {PLATFORM_INSTRUCTION_PDF[platform.id] && (
              <a
                href={PLATFORM_INSTRUCTION_PDF[platform.id]!.url}
                download={PLATFORM_INSTRUCTION_PDF[platform.id]!.fileName}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.instructionPdfLink}
              >
                Инструкция
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
