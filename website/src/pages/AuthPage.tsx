import { useState } from "react";
import { BRAND_NAME } from "../data/plans";
import { saveTokens } from "../utils/api";
import styles from "./AuthPage.module.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface AuthPageProps {
  onSuccess: () => void;
}

export function AuthPage({ onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
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

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoIcon}>🛡️</div>
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
            minLength={6}
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
              minLength={6}
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
