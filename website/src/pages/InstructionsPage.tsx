import { Accordion } from "../components/Accordion";
import { PLATFORMS } from "../data/platforms";
import { PlatformLogo } from "../components/PlatformLogo";
import styles from "./InstructionsPage.module.css";

export function InstructionsPage() {
  const openInstructionInBrowser = (
    platformName: string,
    steps: string[],
  ): void => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    const items = steps.map((step) => `<li>${step}</li>`).join("");
    popup.document.write(
      `<!doctype html><html lang="ru"><head><meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Инструкция — ${platformName}</title>
      <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 760px; margin: 0 auto; padding: 24px; background: #0a0a1a; color: #fff; }
      h1 { font-size: 24px; margin: 0 0 16px; }
      ol { line-height: 1.7; padding-left: 20px; }
      li { margin-bottom: 8px; }
      </style></head><body><h1>Инструкция: ${platformName}</h1><ol>${items}</ol></body></html>`,
    );
    popup.document.close();
  };

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
            <button
              type="button"
              className={styles.instructionBtn}
              onClick={() => openInstructionInBrowser(platform.name, platform.steps)}
            >
              Открыть инструкцию в браузере
            </button>
          </Accordion>
        ))}
      </div>

      <div className={styles.helpCard}>
        <div className={styles.helpTitle}>Нужна помощь?</div>
        <div className={styles.helpText}>
          Если у вас возникли проблемы с настройкой, напишите нам в Telegram-бот
          или на почту поддержки
        </div>
      </div>
    </div>
  );
}
