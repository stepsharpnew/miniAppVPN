import WebApp from "@twa-dev/sdk";
import { useCallback, useEffect, useState } from "react";
import styles from "./SyncPage.module.css";

type SyncMode = "register" | "link";

interface SyncPageProps {
  onBack: () => void;
}

export function SyncPage({ onBack }: SyncPageProps) {
  const [mode, setMode] = useState<SyncMode>("register");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncedLogin, setSyncedLogin] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Set/change password (для уже привязанного аккаунта).
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [setPasswordSuccess, setSetPasswordSuccess] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/sync/status", {
      headers: { "X-Telegram-Init-Data": WebApp.initData },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        if (data?.synced) {
          setSynced(true);
          setSyncedLogin(data.login ?? null);
        }
        setCheckingStatus(false);
      })
      .catch(() => {
        if (alive) setCheckingStatus(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!login.trim() || !password || loading) return;
    setError("");

    if (mode === "register" && password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      setError("Пароль должен быть минимум 8 символов");
      return;
    }

    setLoading(true);
    const endpoint = mode === "register" ? "/api/sync/register" : "/api/sync/link";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({
          login: login.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }, [login, password, confirmPassword, mode, loading]);

  const handleSetPassword = useCallback(async () => {
    if (!newPassword || loading) return;
    setError("");

    if (newPassword !== newPasswordConfirm) {
      setError("Пароли не совпадают");
      return;
    }
    if (newPassword.length < 8) {
      setError("Пароль должен быть минимум 8 символов");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/sync/set-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setSetPasswordSuccess(true);
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }, [newPassword, newPasswordConfirm, loading]);

  if (checkingStatus) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={onBack}>← Назад</button>
        <div className={styles.card}>
          <div className={styles.successIcon}>✓</div>
          <div className={styles.title}>Аккаунт привязан!</div>
          <p className={styles.subtitle}>
            Теперь вы можете входить на сайт по логину <b>{login.trim()}</b> и паролю.
          </p>
          <button className={styles.primaryBtn} onClick={onBack}>
            Вернуться в профиль
          </button>
        </div>
      </div>
    );
  }

  if (synced) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={onBack}>← Назад</button>
        <div className={styles.card}>
          <div className={styles.syncedIcon}>🔗</div>
          <div className={styles.title}>Аккаунт уже привязан</div>
          <p className={styles.subtitle}>
            Ваш Telegram привязан к логину <b>{syncedLogin}</b>.
            Используйте его для входа на сайт.
          </p>

          {!showSetPassword ? (
            <>
              <button
                className={styles.primaryBtn}
                onClick={() => {
                  setShowSetPassword(true);
                  setError("");
                  setSetPasswordSuccess(false);
                }}
              >
                Сменить пароль
              </button>
              <button className={styles.linkBtn} onClick={onBack}>
                Назад
              </button>
            </>
          ) : setPasswordSuccess ? (
            <>
              <div className={styles.successIcon}>✓</div>
              <p className={styles.subtitle}>Пароль обновлён.</p>
              <button className={styles.primaryBtn} onClick={onBack}>
                Готово
              </button>
            </>
          ) : (
            <>
              <p className={styles.subtitle}>
                Задайте новый пароль для входа на сайт. Старый пароль не нужен —
                подтверждение через ваш Telegram-аккаунт.
              </p>
              <input
                type="password"
                className={styles.input}
                placeholder="Новый пароль"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                autoFocus
              />
              <input
                type="password"
                className={styles.input}
                placeholder="Повторите пароль"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
              />
              {error && <div className={styles.error}>{error}</div>}
              <button
                className={styles.primaryBtn}
                onClick={handleSetPassword}
                disabled={!newPassword || loading}
              >
                {loading ? "Сохраняем..." : "Сохранить пароль"}
              </button>
              <button
                className={styles.linkBtn}
                onClick={() => {
                  setShowSetPassword(false);
                  setError("");
                }}
              >
                Отмена
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={onBack}>← Назад</button>

      <div className={styles.card}>
        <div className={styles.title}>
          {mode === "register" ? "Создать веб-аккаунт" : "Привязать веб-аккаунт"}
        </div>

        <div className={styles.modeTabs}>
          <button
            className={`${styles.modeTab} ${mode === "register" ? styles.modeTabActive : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            Новый
          </button>
          <button
            className={`${styles.modeTab} ${mode === "link" ? styles.modeTabActive : ""}`}
            onClick={() => {
              setMode("link");
              setError("");
            }}
          >
            Уже есть
          </button>
        </div>

        <p className={styles.subtitle}>
          {mode === "register"
            ? "Придумайте логин и пароль — они будут использоваться для входа на сайт."
            : "Введите логин и пароль от вашего веб-аккаунта, чтобы привязать его к Telegram."}
        </p>

        <input
          type="text"
          className={styles.input}
          placeholder="Логин"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          minLength={3}
          maxLength={64}
          autoFocus
        />
        <input
          type="password"
          className={styles.input}
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={8}
          onKeyDown={(e) => {
            if (e.key === "Enter" && mode === "link") handleSubmit();
          }}
        />
        {mode === "register" && (
          <input
            type="password"
            className={styles.input}
            placeholder="Повторите пароль"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        )}
        {error && <div className={styles.error}>{error}</div>}
        <button
          className={styles.primaryBtn}
          onClick={handleSubmit}
          disabled={!login.trim() || !password || loading}
        >
          {loading
            ? "Загрузка..."
            : mode === "register"
              ? "Создать и привязать"
              : "Войти и привязать"}
        </button>
      </div>
    </div>
  );
}
