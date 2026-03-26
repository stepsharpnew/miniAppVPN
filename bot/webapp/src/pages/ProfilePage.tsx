import QRCode from "qrcode";
import { useCallback, useState } from "react";
import { BRAND_NAME } from "../../../shared/texts";
import { QrModal } from "../components/QrModal";
import { StatusBadge } from "../components/StatusBadge";
import { useTelegramUser } from "../hooks/useTelegramUser";
import { useVpnConfig } from "../hooks/useVpnConfig";
import styles from "./ProfilePage.module.css";

export function ProfilePage() {
  const user = useTelegramUser();
  const { config, hasConfig } = useVpnConfig();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const handleShowConfig = useCallback(async () => {
    if (!config) return;
    const dataUrl = await QRCode.toDataURL(config, {
      width: 260,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    setQrDataUrl(dataUrl);
  }, [config]);

  return (
    <div className={styles.page}>
      <div className={styles.userCard}>
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
        <div className={styles.userName}>
          {user.firstName} {user.lastName}
        </div>
        <div className={styles.userId}>ID: {user.id || "—"}</div>
      </div>

      <div className={styles.subCard}>
        <div className={styles.sectionHeader}>Статус подписки</div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Статус:</span>
          <StatusBadge active={hasConfig} />
        </div>

        <div className={styles.divider} />

        <div className={styles.row}>
          <span className={styles.rowLabel}>Конфиг:</span>
          {hasConfig ? (
            <button className={styles.configBtn} onClick={handleShowConfig}>
              🔑 Показать
            </button>
          ) : (
            <span className={styles.rowValue}>—</span>
          )}
        </div>
      </div>

      {!hasConfig && (
        <div className={styles.infoCard}>
          <div className={styles.infoText}>
            После оплаты конфиг появится здесь и в чате с ботом {BRAND_NAME}.
          </div>
        </div>
      )}

      {qrDataUrl && config && (
        <QrModal
          qrDataUrl={qrDataUrl}
          onClose={() => setQrDataUrl(null)}
        />
      )}
    </div>
  );
}
