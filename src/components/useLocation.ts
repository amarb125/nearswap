"use client";
import { useCallback, useEffect, useState } from "react";

export interface Loc { lat?: number; lng?: number; city?: string; label: string }
const KEY = "ns_location";

export function useLocation() {
  const [loc, setLoc] = useState<Loc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setLoc(JSON.parse(saved));
    } catch {}
  }, []);

  const save = useCallback((l: Loc) => {
    setLoc(l);
    try { localStorage.setItem(KEY, JSON.stringify(l)); } catch {}
  }, []);

  const detect = useCallback(() => {
    if (!navigator.geolocation) return setError("Location isn't available on this device. Enter your city instead.");
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        save({ lat: Math.round(p.coords.latitude * 1000) / 1000, lng: Math.round(p.coords.longitude * 1000) / 1000, label: "Near you" });
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Allow location access or enter your city.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }, [save]);

  return { loc, save, detect, error, locating };
}
