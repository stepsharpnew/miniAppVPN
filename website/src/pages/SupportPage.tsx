import { useState, useEffect, useRef, useCallback } from "react";
import { type WebUser } from "../hooks/useAuth";
import { apiFetch } from "../utils/api";
import { Accordion } from "../components/Accordion";
import { FAQ_ITEMS, BRAND_NAME } from "../data/plans";
import styles from "./SupportPage.module.css";

interface ChatMessage {
  id: string;
  from: "user" | "support";
  type: "text" | "photo" | "document";
  text?: string;
  fileName?: string;
  timestamp: number;
}

interface SupportPageProps {
  user: WebUser | null;
}

export function SupportPage({ user }: SupportPageProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatStarted, setChatStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastTsRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 60);
  }, []);

  useEffect(() => {
    if (!user || loaded) return;
    apiFetch<{ messages: ChatMessage[] }>("/api/web/support/messages")
      .then((data) => {
        if (data.messages.length > 0) {
          setMessages(data.messages);
          setChatStarted(true);
          lastTsRef.current = Math.max(...data.messages.map((m) => m.timestamp));
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [user, loaded]);

  useEffect(() => {
    if (!chatStarted || !user) return;
    let alive = true;
    const poll = async () => {
      try {
        const data = await apiFetch<{ messages: ChatMessage[] }>(
          `/api/web/support/messages?after=${lastTsRef.current}`,
        );
        if (!alive || data.messages.length === 0) return;
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter((m) => !ids.has(m.id));
          if (fresh.length === 0) return prev;
          return [...prev, ...fresh];
        });
        const maxTs = Math.max(...data.messages.map((m) => m.timestamp));
        if (maxTs > lastTsRef.current) lastTsRef.current = maxTs;
        scrollToBottom();
      } catch {}
    };
    const id = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [chatStarted, user, scrollToBottom]);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      const { message } = await apiFetch<{ message: ChatMessage }>(
        "/api/web/support/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      setMessages((prev) => [...prev, message]);
      lastTsRef.current = Math.max(lastTsRef.current, message.timestamp);
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const faqList = (
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
  );

  if (!chatStarted) {
    return (
      <div className={styles.page}>
        <div className={styles.mainCard}>
          <div className={styles.iconWrap}>💬</div>
          <div className={styles.title}>Служба поддержки</div>
          <div className={styles.subtitle}>
            Опишите проблему — менеджер ответит прямо здесь
          </div>
          {user ? (
            <button className={styles.startBtn} onClick={() => setChatStarted(true)}>
              Начать диалог
            </button>
          ) : (
            <div className={styles.noAuth}>
              Войдите в аккаунт для доступа к чату
            </div>
          )}
        </div>
        <div className={styles.faqSection}>
          <div className={styles.faqTitle}>Часто задаваемые вопросы</div>
          {faqList}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.chatCard}>
        <div className={styles.chatHeader}>
          <div className={styles.chatAvatar}>🛡️</div>
          <div className={styles.chatHeaderInfo}>
            <div className={styles.chatHeaderTitle}>Поддержка {BRAND_NAME}</div>
            <div className={styles.chatHeaderStatus}>
              обычно отвечает в течение часа
            </div>
          </div>
        </div>

        <div className={styles.chatMessages}>
          {messages.length === 0 && (
            <div className={styles.chatEmpty}>
              <span className={styles.chatEmptyIcon}>💬</span>
              <span>Напишите сообщение</span>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className={styles.chatInputBar}>
          <input
            type="text"
            className={styles.textInput}
            placeholder="Сообщение..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!input.trim() || sending}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.from === "user";
  const time = new Date(msg.timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleSupport}`}>
      {!isUser && <div className={styles.bubbleLabel}>Поддержка</div>}
      {msg.text && <div className={styles.msgText}>{msg.text}</div>}
      {msg.type === "document" && (
        <div className={styles.fileAttach}>📄 {msg.fileName || "Файл"}</div>
      )}
      <div className={styles.msgTime}>{time}</div>
    </div>
  );
}
