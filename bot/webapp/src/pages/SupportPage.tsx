import { useState, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import { Accordion } from '../components/Accordion';
import { FAQ_ITEMS } from '../../../shared/texts';
import { type WebAppSupportPayload } from '../../../shared/plans';
import styles from './SupportPage.module.css';

export function SupportPage() {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSend = useCallback(() => {
    if (!message.trim()) return;

    const payload: WebAppSupportPayload = {
      type: 'support',
      message: message.trim(),
    };
    WebApp.sendData(JSON.stringify(payload));
    setSent(true);
  }, [message]);

  return (
    <div className={styles.page}>
      <div className={styles.mainCard}>
        <div className={styles.iconWrap}>💬</div>
        <div className={styles.title}>Служба поддержки</div>
        <div className={styles.subtitle}>
          Напишите сообщение — менеджер получит его и ответит в боте
        </div>

        {!sent ? (
          <div className={styles.form}>
            <textarea
              className={styles.textarea}
              placeholder="Опишите вашу проблему..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!message.trim()}
            >
              Отправить сообщение
            </button>
          </div>
        ) : (
          <div className={styles.sentMessage}>
            Сообщение отправлено! Менеджер скоро ответит в боте.
          </div>
        )}
      </div>

      <div className={styles.faqSection}>
        <div className={styles.faqTitle}>Часто задаваемые вопросы</div>

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
    </div>
  );
}
