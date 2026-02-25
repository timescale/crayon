import { useState, useEffect, useCallback } from "react";

export type Page = "dashboard" | "canvas" | "credentials";

interface RouterState {
  page: Page;
  workflow: string | null;
}

function parseHash(): RouterState {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash || hash === "dashboard") {
    return { page: "dashboard", workflow: null };
  }
  if (hash === "credentials") {
    return { page: "credentials", workflow: null };
  }
  if (hash === "canvas") {
    return { page: "canvas", workflow: null };
  }
  if (hash.startsWith("canvas/")) {
    return { page: "canvas", workflow: decodeURIComponent(hash.slice("canvas/".length)) || null };
  }
  return { page: "dashboard", workflow: null };
}

function buildHash(page: Page, workflow: string | null): string {
  if (page === "dashboard") return "#/dashboard";
  if (page === "credentials") return "#/credentials";
  if (page === "canvas" && workflow) return `#/canvas/${encodeURIComponent(workflow)}`;
  return "#/canvas";
}

export function useHashRouter() {
  const [state, setState] = useState<RouterState>(parseHash);

  // Listen for back/forward
  useEffect(() => {
    const onPopState = () => setState(parseHash());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((page: Page, workflow?: string | null) => {
    const wf = workflow !== undefined ? workflow : state.workflow;
    const newHash = buildHash(page, page === "canvas" ? wf : null);
    if (newHash !== window.location.hash) {
      window.history.pushState(null, "", newHash);
    }
    setState({ page, workflow: page === "canvas" ? wf : state.workflow });
  }, [state.workflow]);

  const selectWorkflow = useCallback((workflowName: string) => {
    const newHash = buildHash("canvas", workflowName);
    window.history.pushState(null, "", newHash);
    setState({ page: "canvas", workflow: workflowName });
  }, []);

  return {
    page: state.page,
    selectedWorkflow: state.workflow,
    navigate,
    selectWorkflow,
  };
}
