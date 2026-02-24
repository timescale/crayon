import { useState, useEffect, useCallback } from "react";

export function useRouter() {
  const [path, setPath] = useState(window.location.pathname);

  const navigate = useCallback((to: string) => {
    if (to === path) return;
    history.pushState(null, "", to);
    setPath(to);
  }, [path]);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return { path, navigate };
}

/**
 * Match a URL path against a pattern with named params.
 * e.g. matchRoute("/workflows/my-wf", "/workflows/:name") => { name: "my-wf" }
 * Returns null if no match.
 */
export function matchRoute(
  path: string,
  pattern: string,
): Record<string, string> | null {
  const pathParts = path.split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);

  if (pathParts.length !== patternParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
