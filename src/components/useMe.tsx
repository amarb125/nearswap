"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Me } from "./api";

const Ctx = createContext<{ me: Me | null; loading: boolean; refresh: () => Promise<void> }>({ me: null, loading: true, refresh: async () => {} });

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: Me | null }>("/api/me");
      setMe(r.user);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ me, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useMe = () => useContext(Ctx);
