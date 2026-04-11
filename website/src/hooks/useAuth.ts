import { useCallback, useEffect, useState } from "react";
import { apiFetch, clearTokens, getAccessToken } from "../utils/api";

export interface WebUser {
  id: string;
  email: string | null;
  auth_source: string;
  active: boolean;
  expired_at: string | null;
  is_blocked: boolean;
  created_at: string;
  has_config: boolean;
}

export function useAuth() {
  const [user, setUser] = useState<WebUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: WebUser }>("/api/web/me");
      setUser(data.user);
    } catch {
      setUser(null);
      clearTokens();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return { user, loading, logout, refresh: fetchMe };
}
