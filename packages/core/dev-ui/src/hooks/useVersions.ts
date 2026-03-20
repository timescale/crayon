import { useState, useEffect, useCallback } from "react";
import type { VersionEntry } from "../types";

export function useVersions() {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch("/dev/api/versions?limit=20");
      if (res.ok) {
        setVersions(await res.json());
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // Refetch when server broadcasts versions-changed
  useEffect(() => {
    const handler = () => { fetchVersions(); };
    window.addEventListener("versions-changed", handler);
    return () => window.removeEventListener("versions-changed", handler);
  }, [fetchVersions]);

  return { versions, loading };
}
