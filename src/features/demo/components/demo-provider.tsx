"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createInitialDemoData } from "@/features/demo/lib/demo-data";
import type { DemoData } from "@/features/demo/lib/demo-types";

const STORAGE_KEY = "dentalflow-local-demo-v1";

type DemoContextValue = {
  data: DemoData;
  ready: boolean;
  storageWarning: string | null;
  updateData: (updater: (current: DemoData) => DemoData) => void;
  reset: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(createInitialDemoData);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isDemoData(parsed)) {
          setData(parsed);
        } else {
          setStorageWarning(
            "Saved demo data is invalid. Reset the demo to restore its fictional sample data.",
          );
        }
      }
    } catch {
      setStorageWarning(
        "Browser storage is unavailable. Changes will remain only for this tab session.",
      );
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setStorageWarning(null);
    } catch {
      setStorageWarning(
        "Could not save to browser storage. Changes will remain only for this tab session.",
      );
    }
  }, [data, ready]);

  const updateData = useCallback((updater: (current: DemoData) => DemoData) => {
    setData(updater);
  }, []);

  const reset = useCallback(() => {
    const freshData = createInitialDemoData();
    setData(freshData);
    setStorageWarning(null);
  }, []);

  const value = useMemo(
    () => ({ data, ready, storageWarning, updateData, reset }),
    [data, ready, storageWarning, updateData, reset],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoData(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemoData must be used inside DemoProvider.");
  }
  return context;
}

function isDemoData(value: unknown): value is DemoData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoData>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.patients) &&
    Array.isArray(candidate.appointments) &&
    Array.isArray(candidate.treatmentPlans) &&
    Array.isArray(candidate.recalls) &&
    Array.isArray(candidate.followUps) &&
    Array.isArray(candidate.templates) &&
    Array.isArray(candidate.messages)
  );
}
