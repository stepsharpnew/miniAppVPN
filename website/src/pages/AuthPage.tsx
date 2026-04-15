import { useRef, useState } from "react";
import { BRAND_NAME } from "../data/plans";
import logoImg from "../photo_2026-04-11_16-38-41.jpg";
import { saveTokens } from "../utils/api";
import styles from "./AuthPage.module.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

type Mode = "login" | "register" | "forgot" | "forgot-code" | "forgot-new-password";

interface AuthPageProps {
  onSuccess: () => void;
}

export function AuthPage({ onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "register" && password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/web/login" : "/api/web/register";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка сервера");
        return;
      }
      saveTokens(data.accessToken, data.refreshToken);
      onSuccess();
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSendCode = async () => {
    if (!email.trim()) {
      setError("Введите email");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/web/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setMode("forgot-code");
      setTimeout(() => codeRef.current?.focus(), 100);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyResetCode = async () => {
    if (!resetCode.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/web/verify-reset-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: resetCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setVerifyToken(data.verifyToken);
      setMode("forgot-new-password");
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword !== confirmNewPassword) {
      setError("Пароли не совпадают");
      return;
    }
    if (newPassword.length < 8) {
      setError("Пароль должен быть минимум 8 символов");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/web/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          verifyToken,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      saveTokens(data.accessToken, data.refreshToken);
      onSuccess();
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const switchToLogin = () => {
    setMode("login");
    setError("");
    setResetCode("");
    setVerifyToken("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  // ── Forgot password flow ──

  if (mode === "forgot") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <img src={logoImg} alt="" className={styles.logoImg} width={64} height={64} />
          <div className={styles.brand}>{BRAND_NAME}</div>
          <div className={styles.subtitle}>Восстановление пароля</div>

          <div className={styles.form}>
            <input
              type="email"
              className={styles.input}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleForgotSendCode()}
            />
            {error && <div className={styles.error}>{error}</div>}
            <button
              type="button"
              className={styles.submitBtn}
              disabled={loading || !email.trim()}
              onClick={handleForgotSendCode}
            >
              {loading ? "Отправляем..." : "Получить код"}
            </button>
          </div>

          <button className={styles.switchBtn} onClick={switchToLogin}>
            Вернуться ко входу
          </button>
        </div>
      </div>
    );
  }

  if (mode === "forgot-code") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <img src={logoImg} alt="" className={styles.logoImg} width={64} height={64} />
          <div className={styles.brand}>{BRAND_NAME}</div>
          <div className={styles.subtitle}>
            Код отправлен на <b>{email}</b>
          </div>

          <div className={styles.form}>
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              className={`${styles.input} ${styles.codeInput}`}
              placeholder="Код из письма"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
              maxLength={5}
              autoComplete="one-time-code"
              onKeyDown={(e) => e.key === "Enter" && handleVerifyResetCode()}
            />
            {error && <div className={styles.error}>{error}</div>}
            <button
              type="button"
              className={styles.submitBtn}
              disabled={loading || resetCode.length < 5}
              onClick={handleVerifyResetCode}
            >
              {loading ? "Проверяем..." : "Подтвердить"}
            </button>
          </div>

          <button className={styles.switchBtn} onClick={switchToLogin}>
            Вернуться ко входу
          </button>
        </div>
      </div>
    );
  }

  if (mode === "forgot-new-password") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <img src={logoImg} alt="" className={styles.logoImg} width={64} height={64} />
          <div className={styles.brand}>{BRAND_NAME}</div>
          <div className={styles.subtitle}>Установите новый пароль</div>

          <div className={styles.form}>
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
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
            />
            {error && <div className={styles.error}>{error}</div>}
            <button
              type="button"
              className={styles.submitBtn}
              disabled={loading || !newPassword}
              onClick={handleResetPassword}
            >
              {loading ? "Сохраняем..." : "Сохранить пароль"}
            </button>
          </div>

          <button className={styles.switchBtn} onClick={switchToLogin}>
            Вернуться ко входу
          </button>
        </div>
      </div>
    );
  }

  // ── Login / Register ──

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <img src={logoImg} alt="" className={styles.logoImg} width={64} height={64} />
        <div className={styles.brand}>{BRAND_NAME}</div>
        <div className={styles.subtitle}>
          {mode === "login" ? "Войдите в аккаунт" : "Создайте аккаунт"}
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            type="email"
            className={styles.input}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            className={styles.input}
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "register" && (
            <input
              type="password"
              className={styles.input}
              placeholder="Повторите пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          )}

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading
              ? "Загрузка..."
              : mode === "login"
                ? "Войти"
                : "Зарегистрироваться"}
          </button>
        </form>

        {mode === "login" && (
          <button
            className={styles.forgotBtn}
            onClick={() => {
              setMode("forgot");
              setError("");
            }}
          >
            Забыли пароль?
          </button>
        )}

        <button
          className={styles.switchBtn}
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "Нет аккаунта? Зарегистрируйтесь"
            : "Уже есть аккаунт? Войдите"}
        </button>
      </div>
    </div>
  );
}
