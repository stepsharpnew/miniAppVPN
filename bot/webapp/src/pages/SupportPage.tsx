import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import WebApp from "@twa-dev/sdk";
import { Accordion } from "../components/Accordion";
import { FAQ_ITEMS } from "../../../shared/texts";
import { type ChatMessage } from "../../../shared/plans";
import styles from "./SupportPage.module.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

function apiHeaders(): Record<string, string> {
  return { "X-Telegram-Init-Data": WebApp.initData };
}

async function apiJson<T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string>),
      ...apiHeaders(),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface DisplayMessage extends ChatMessage {
  localPreview?: string;
}

interface SupportPageProps {
  active?: boolean;
}

export function SupportPage({ active = false }: SupportPageProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatStarted, setChatStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTsRef = useRef(0);

  const canChat = !!WebApp.initData;

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 60);
  }, []);

  // Initial load — check for existing conversation
  useEffect(() => {
    if (!active || loaded || !canChat) {
      if (!canChat) setLoaded(true);
      return;
    }

    apiJson<{ messages: ChatMessage[] }>("/api/support/messages")
      .then((data) => {
        if (data.messages.length > 0) {
          setMessages(data.messages);
          setChatStarted(true);
          lastTsRef.current = Math.max(
            ...data.messages.map((m) => m.timestamp),
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoaded(true));
  }, [active, loaded, canChat]);

  // Poll for new messages
  useEffect(() => {
    if (!active || !chatStarted || !canChat) return;

    let alive = true;

    const poll = async () => {
      try {
        const data = await apiJson<{ messages: ChatMessage[] }>(
          `/api/support/messages?after=${lastTsRef.current}`,
        );
        if (!alive || data.messages.length === 0) return;

        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const fresh = data.messages.filter(
            (m: ChatMessage) => !ids.has(m.id),
          );
          if (fresh.length === 0) return prev;
          return [...prev, ...fresh];
        });

        const maxTs = Math.max(
          ...data.messages.map((m: ChatMessage) => m.timestamp),
        );
        if (maxTs > lastTsRef.current) lastTsRef.current = maxTs;
        scrollToBottom();
      } catch {
        /* silently retry */
      }
    };

    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active, chatStarted, canChat, scrollToBottom]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // ── Handlers ──

  const handleStartChat = () => setChatStarted(true);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);

    try {
      const { message } = await apiJson<{ message: ChatMessage }>(
        "/api/support/send",
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || sending) return;
    e.target.value = "";
    setSending(true);

    const isImage = file.type.startsWith("image/");
    const localPreview = isImage ? URL.createObjectURL(file) : undefined;

    try {
      const fd = new FormData();
      fd.append("file", file);

      const { message } = await apiJson<{ message: ChatMessage }>(
        "/api/support/upload",
        { method: "POST", body: fd },
      );

      const display: DisplayMessage = { ...message, localPreview };
      setMessages((prev) => [...prev, display]);
      lastTsRef.current = Math.max(lastTsRef.current, message.timestamp);
    } catch {
      if (localPreview) URL.revokeObjectURL(localPreview);
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

  // ── Welcome screen ──

  if (!chatStarted) {
    return (
      <div className={styles.page}>
        <div className={styles.mainCard}>
          <div className={styles.iconWrap}>💬</div>
          <div className={styles.title}>Служба поддержки</div>
          <div className={styles.subtitle}>
            Опишите проблему — менеджер ответит прямо здесь
          </div>
          {canChat && (
            <button className={styles.startBtn} onClick={handleStartChat}>
              Начать диалог
            </button>
          )}
          {!canChat && (
            <div className={styles.noAuth}>
              Откройте через Telegram-бот для доступа к чату
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

  // ── Chat view ──
  // Портал в body: иначе position:fixed привязывается к предку с overflow (App),
  // и в Telegram/WebKit ломается раскладка (поле ввода «уезжает» вверх).

  const chatTree = (
    <div className={styles.chatContainer}>
      <div className={styles.chatHeader}>
        <div className={styles.chatAvatar}>🛡️</div>
        <div className={styles.chatHeaderInfo}>
          <div className={styles.chatHeaderTitle}>Поддержка {BRAND_NAME}</div>
          <div className={styles.chatHeaderStatus}>
            обычно отвечает в течение часа
          </div>
        </div>
      </div>

      <div className={styles.chatMessages} ref={messagesContainerRef}>
        {messages.length === 0 && (
          <div className={styles.chatEmpty}>
            <span className={styles.chatEmptyIcon}>💬</span>
            <span>Напишите сообщение или прикрепите файл</span>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className={styles.chatInputBar}>
        <button
          className={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className={styles.fileInput}
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar,.xlsx,.csv"
        />
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
            <path
              d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  return <>{active && createPortal(chatTree, document.body)}</>;
}

const BRAND_NAME = "MEME VPN";

// ── Sub-components ──

function MessageBubble({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.from === "user";
  const time = new Date(msg.timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleSupport}`}
    >
      {!isUser && <div className={styles.bubbleLabel}>Поддержка</div>}

      {msg.type === "photo" && msg.localPreview && (
        <img src={msg.localPreview} className={styles.msgPhoto} alt="" />
      )}

      {msg.type === "photo" && !msg.localPreview && msg.fileId && (
        <TelegramImage fileId={msg.fileId} />
      )}

      {msg.type === "document" && (
        <div className={styles.fileAttach}>
          <span className={styles.fileIcon}>📄</span>
          <span className={styles.fileName}>
            {msg.fileName || "Файл"}
          </span>
        </div>
      )}

      {msg.type === "photo" && !msg.fileId && !msg.localPreview && (
        <div className={styles.fileAttach}>
          <span className={styles.fileIcon}>📷</span>
          <span className={styles.fileName}>
            {msg.fileName || "Фото"}
          </span>
        </div>
      )}

      {msg.text && <div className={styles.msgText}>{msg.text}</div>}

      <div className={styles.msgTime}>{time}</div>
    </div>
  );
}

function TelegramImage({ fileId }: { fileId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    fetch(`${API_BASE}/api/support/file/${fileId}`, {
      headers: apiHeaders(),
    })
      .then((r) => r.blob())
      .then((blob) => {
        if (alive) setUrl(URL.createObjectURL(blob));
      })
      .catch(console.error);

    return () => {
      alive = false;
    };
  }, [fileId]);

  if (!url) {
    return <div className={styles.photoLoading}>Загрузка...</div>;
  }
  return <img src={url} className={styles.msgPhoto} alt="" />;
}
