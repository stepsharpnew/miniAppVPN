import WebApp from "@twa-dev/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./SyncPage.module.css";

type Step = "email" | "code" | "password";
type SyncMode = "register" | "login" | null;

interface SyncPageProps {
  onBack: () => void;
}

export function SyncPage({ onBack }: SyncPageProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [syncMode, setSyncMode] = useState<SyncMode>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncedEmail, setSyncedEmail] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const codeInputRef = useRef<HTMLInputElement>(null);

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
          setSyncedEmail(data.email);
        }
        setCheckingStatus(false);
      })
      .catch(() => {
        if (alive) setCheckingStatus(false);
      });
    return () => { alive = false; };
  }, []);

  const handleSendCode = useCallback(async () => {
    if (!email.trim() || loading) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/sync/send-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка отправки");
        return;
      }
      setStep("code");
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }, [email, loading]);

  const handleVerifyCode = useCallback(async () => {
    if (!code.trim() || loading) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/sync/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка верификации");
        return;
      }
      setVerifyToken(data.verifyToken);
      setSyncMode(data.mode);
      setStep("password");
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }, [email, code, loading]);

  const handleSubmitPassword = useCallback(async () => {
    if (!password || loading) return;
    setError("");

    if (syncMode === "register" && password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      setError("Пароль должен быть минимум 8 символов");
      return;
    }

    setLoading(true);
    const endpoint = syncMode === "register" ? "/api/sync/register" : "/api/sync/login";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": WebApp.initData,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          verifyToken,
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
  }, [password, confirmPassword, syncMode, email, verifyToken, loading]);

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
            Теперь вы можете входить на сайт с помощью <b>{email}</b> и пароля.
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
            Ваш Telegram привязан к <b>{syncedEmail}</b>.
            Используйте этот email и пароль для входа на сайт.
          </p>
          <button className={styles.primaryBtn} onClick={onBack}>
            Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={onBack}>← Назад</button>

      <div className={styles.card}>
        <div className={styles.stepIndicator}>
          <div className={`${styles.dot} ${step === "email" ? styles.dotActive : styles.dotDone}`} />
          <div className={styles.line} />
          <div className={`${styles.dot} ${step === "code" ? styles.dotActive : step === "password" ? styles.dotDone : ""}`} />
          <div className={styles.line} />
          <div className={`${styles.dot} ${step === "password" ? styles.dotActive : ""}`} />
        </div>

        {step === "email" && (
          <>
            <div className={styles.title}>Привязка аккаунта</div>
            <p className={styles.subtitle}>
              Введите email, на который придёт код подтверждения.
              После привязки вы сможете входить на сайт с помощью email и пароля.
            </p>
            <input
              type="email"
              className={styles.input}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
            />
            {error && <div className={styles.error}>{error}</div>}
            <button
              className={styles.primaryBtn}
              onClick={handleSendCode}
              disabled={!email.trim() || loading}
            >
              {loading ? "Отправляем..." : "Получить код"}
            </button>
          </>
        )}

        {step === "code" && (
          <>
            <div className={styles.title}>Введите код</div>
            <p className={styles.subtitle}>
              Код отправлен на <b>{email}</b>
            </p>
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              className={`${styles.input} ${styles.codeInput}`}
              placeholder="Код из письма"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
              maxLength={5}
              autoComplete="one-time-code"
              onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
            />
            {error && <div className={styles.error}>{error}</div>}
            <button
              className={styles.primaryBtn}
              onClick={handleVerifyCode}
              disabled={code.length < 5 || loading}
            >
              {loading ? "Проверяем..." : "Подтвердить"}
            </button>
            <button
              className={styles.linkBtn}
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
            >
              Изменить email
            </button>
          </>
        )}

        {step === "password" && (
          <>
            <div className={styles.title}>
              {syncMode === "register" ? "Задайте пароль" : "Введите пароль"}
            </div>
            <p className={styles.subtitle}>
              {syncMode === "register"
                ? "Этот пароль будет использоваться для входа на сайт"
                : "Введите пароль от вашего аккаунта на сайте"}
            </p>
            <input
              type="password"
              className={styles.input}
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={syncMode === "register" ? "new-password" : "current-password"}
              minLength={8}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && syncMode === "login") handleSubmitPassword();
              }}
            />
            {syncMode === "register" && (
              <input
                type="password"
                className={styles.input}
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                onKeyDown={(e) => e.key === "Enter" && handleSubmitPassword()}
              />
            )}
            {error && <div className={styles.error}>{error}</div>}
            <button
              className={styles.primaryBtn}
              onClick={handleSubmitPassword}
              disabled={!password || loading}
            >
              {loading
                ? "Загрузка..."
                : syncMode === "register"
                  ? "Привязать аккаунт"
                  : "Войти и привязать"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
