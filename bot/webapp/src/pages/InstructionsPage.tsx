import { Accordion } from "../components/Accordion";
import { PLATFORMS } from "../../../shared/platforms";
import { PlatformLogo } from "../components/PlatformLogo";
import { useState } from "react";
import { waitForTelegramInitData } from "../utils/telegramInitData";
import styles from "./InstructionsPage.module.css";

export function InstructionsPage() {
  const [sendingFor, setSendingFor] = useState<string | null>(null);

  const sendInstructionToChat = async (platformId: string) => {
    if (sendingFor) return;
    setSendingFor(platformId);
    try {
      const initData = await waitForTelegramInitData();
      const res = await fetch("/api/instructions/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData ?? "",
        },
        body: JSON.stringify({ platformId }),
      });
      if (!res.ok) throw new Error("send_failed");
      alert("Инструкция отправлена в чат с ботом");
    } catch {
      alert("Не удалось отправить инструкцию. Попробуйте еще раз.");
    } finally {
      setSendingFor(null);
    }
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
              className={styles.instructionPdfLink}
              onClick={() => void sendInstructionToChat(platform.id)}
              disabled={sendingFor === platform.id}
            >
              {sendingFor === platform.id ? "Отправка..." : "Отправить инструкцию в чат"}
            </button>
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
