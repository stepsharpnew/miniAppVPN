import { Accordion } from "../components/Accordion";
import { FAQ_ITEMS, BRAND_NAME } from "../data/plans";
import styles from "./FaqPage.module.css";

export function FaqPage() {
  return (
    <div className={styles.page}>
      <div className={styles.mainCard}>
        <div className={styles.iconWrap}>💬</div>
        <div className={styles.title}>Поддержка</div>
        <div className={styles.subtitle}>
          Ответы на частые вопросы и контакты
        </div>
      </div>

      <div className={styles.faqSection}>
        <div className={styles.faqSectionTitle}>Часто задаваемые вопросы</div>
        <div className={styles.faqList}>
          {FAQ_ITEMS.map((item, idx) => (
            <Accordion
              key={idx}
              icon={item.icon}
              title={item.question}
              iconColor="rgba(77,139,255,0.15)"
            >
              <p className={styles.answer}>{item.answer}</p>
            </Accordion>
          ))}
        </div>
      </div>

      <div className={styles.contactCard}>
        <div className={styles.contactTitle}>Связаться с нами</div>
        <div className={styles.contactLinks}>
          <a
            href="https://t.me/MemeVPNbest"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.contactBtn}
          >
            <span className={styles.contactBtnIcon}>💬</span>
            Telegram-канал
          </a>
          <a
            href="https://t.me/MemeVPNbest"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.contactBtnSecondary}
          >
            <span className={styles.contactBtnIcon}>🤖</span>
            Telegram-бот {BRAND_NAME}
          </a>
        </div>
      </div>
    </div>
  );
}
