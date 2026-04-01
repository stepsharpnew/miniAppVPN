import WebApp from "@twa-dev/sdk";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { BRAND_NAME } from "../../../shared/texts";
import { QrModal } from "../components/QrModal";
import { StatusBadge } from "../components/StatusBadge";
import { useTelegramUser } from "../hooks/useTelegramUser";
import { useVpnConfig } from "../hooks/useVpnConfig";
import styles from "./ProfilePage.module.css";

interface SubscriptionInfo {
  active: boolean;
  expired_at: string | null;
  is_blocked?: boolean;
  is_vip?: boolean;
  config?: string | null;
}

interface UserConfig {
  id: string;
  number: number;
  config: string;
  server_id: string | null;
}

interface ConfigApiItem {
  id?: string;
  number?: number;
  config?: string;
  server_id?: string | null;
}

interface ConfigurationsResponse {
  configs?: ConfigApiItem[];
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return "Истекла";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 30) {
    const months = Math.floor(days / 30);
    const rem = days % 30;
    return rem > 0 ? `${months} мес. ${rem} дн.` : `${months} мес.`;
  }
  if (days > 0) return `${days} дн.`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `${hours} ч.`;
}

export function ProfilePage() {
  const user = useTelegramUser();
  const { config: localConfig, save: saveLocalConfig } = useVpnConfig();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [configs, setConfigs] = useState<UserConfig[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creatingSecond, setCreatingSecond] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<UserConfig | null>(null);

  const loadConfigurations = useCallback(async () => {
    try {
      const res = await fetch("/api/configurations", {
        headers: { "X-Telegram-Init-Data": WebApp.initData },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as ConfigurationsResponse;
      const items: UserConfig[] = Array.isArray(data?.configs)
        ? data.configs
            .filter((c) => typeof c?.number === "number" && typeof c?.config === "string")
            .map((c) => ({
              id: String(c.id ?? `${c.number}`),
              number: c.number as number,
              config: c.config as string,
              server_id: c.server_id ?? null,
            }))
        : [];
      setConfigs(items);
      return items;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/subscription", {
      headers: { "X-Telegram-Init-Data": WebApp.initData },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (!alive) return;
        if (data) {
          setSub(data);
          if (data.config) saveLocalConfig(data.config);
        } else {
          setSub({ active: false, expired_at: null, config: null });
        }
        await loadConfigurations();
        setLoaded(true);
      })
      .catch(() => {
        if (alive) {
          setSub({ active: false, expired_at: null, config: null });
          setLoaded(true);
        }
      });
    return () => { alive = false; };
  }, []);

  const activeConfig = sub?.config ?? (sub?.active ? localConfig : null);

  useEffect(() => {
    let alive = true;
    if (!selectedConfig?.config) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(selectedConfig.config, {
      width: 260,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((dataUrl) => {
        if (alive) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (alive) setQrDataUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [selectedConfig]);

  const handleSendFile = useCallback(async () => {
    const targetConfig = selectedConfig?.config ?? activeConfig;
    if (sending || !targetConfig) return;
    setSending(true);
    try {
      const res = await fetch("/api/payments/config/send-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ config: targetConfig }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSent(true);
    } catch {
      WebApp.showAlert("Не удалось отправить файл. Попробуйте позже.");
    } finally {
      setSending(false);
    }
  }, [sending, selectedConfig, activeConfig]);

  const handleCreateSecond = useCallback(async () => {
    if (creatingSecond) return;
    setCreatingSecond(true);
    try {
      const res = await fetch("/api/configurations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
      });
      if (!res.ok) {
        if (res.status === 403) {
          WebApp.showAlert("Создание доступно только при активной подписке.");
          return;
        }
        if (res.status === 409) {
          WebApp.showAlert("Конфигурация №2 уже создана.");
          return;
        }
        throw new Error(`${res.status}`);
      }
      await loadConfigurations();
      WebApp.showAlert("Конфигурация №2 создана.");
    } catch {
      WebApp.showAlert("Не удалось создать конфигурацию. Попробуйте позже.");
    } finally {
      setCreatingSecond(false);
    }
  }, [creatingSecond, loadConfigurations]);

  const sortedConfigs = [...configs].sort((a, b) => a.number - b.number);
  const hasSecondConfig = sortedConfigs.some((c) => c.number === 2);

  return (
    <div className={styles.page}>
      <div className={styles.profileCard}>
        <div className={styles.profileTop}>
          {user.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.firstName}
              className={styles.avatar}
            />
          ) : (
            <div className={`${styles.avatar} ${styles.avatarPlaceholder}`}>
              {user.firstName.charAt(0)}
            </div>
          )}

          <div className={styles.profileMeta}>
            <div className={styles.userName}>
              {user.firstName} {user.lastName}
            </div>
            <div className={styles.userId}>ID: {user.id || "—"}</div>
          </div>

          <div className={styles.statusWrap}>
            <div className={styles.statusLabel}>Подписка</div>
            <StatusBadge active={sub?.active ?? false} />
            {sub?.active && sub.expired_at && (
              <div className={styles.expiryInfo}>
                {formatExpiry(sub.expired_at)}
              </div>
            )}
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.configBlock}>
          <div className={styles.sectionHeader}>Мои конфигурации</div>

          {!loaded ? (
            <div className={styles.noConfig}>Загрузка...</div>
          ) : sub?.active && (sortedConfigs.length > 0 || activeConfig) ? (
            <div className={styles.configList}>
              {sortedConfigs.map((cfg) => (
                <button
                  key={cfg.id}
                  className={styles.configItem}
                  onClick={() => {
                    setSelectedConfig(cfg);
                    setSent(false);
                  }}
                >
                  Конфигурация №{cfg.number}
                </button>
              ))}
              {!hasSecondConfig && (
                <button
                  className={styles.createBtn}
                  onClick={handleCreateSecond}
                >
                  {creatingSecond ? "Создаем..." : "Создать"}
                </button>
              )}
            </div>
          ) : (
            <div className={styles.noConfig}>
              После оплаты конфиг появится здесь и в чате с ботом {BRAND_NAME}.
            </div>
          )}
        </div>
      </div>
      {selectedConfig && qrDataUrl && (
        <QrModal
          qrDataUrl={qrDataUrl}
          title={`QR код подписки — Конфигурация №${selectedConfig.number}`}
          onClose={() => setSelectedConfig(null)}
          footerContent={(
            <button
              className={`${styles.sendBtn} ${sent ? styles.sent : ""}`}
              onClick={sent ? undefined : handleSendFile}
            >
              {sending
                ? "Отправляем..."
                : sent
                  ? "✓ Файл отправлен в чат"
                  : "📄 Получить .conf файлом"}
            </button>
          )}
        />
      )}
    </div>
  );
}
