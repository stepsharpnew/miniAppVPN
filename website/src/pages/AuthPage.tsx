import { useState } from "react";
import { BRAND_NAME } from "../data/plans";
import logoImg from "../photo_2026-04-11_16-38-41.jpg";
import { saveTokens } from "../utils/api";
import styles from "./AuthPage.module.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

type Mode = "login" | "register";

interface AuthPageProps {
  onSuccess: () => void;
}

export function AuthPage({ onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        body: JSON.stringify({ login: login.trim(), password }),
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
            type="text"
            className={styles.input}
            placeholder="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            autoComplete="username"
            minLength={3}
            maxLength={64}
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
          <div className={styles.recoveryHint}>
            Забыли пароль? Если ваш аккаунт привязан к Telegram, задайте новый пароль
            в Mini App. Иначе — обратитесь в поддержку через бота.
          </div>
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
