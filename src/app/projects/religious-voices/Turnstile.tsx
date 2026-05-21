"use client";

import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

// Minimal Cloudflare Turnstile widget — no third-party React wrapper, just
// the official script + the global render API. Exposes getToken / reset
// imperatively so the parent can drive it from the chat submit handler.

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
      remove: (widgetId?: string) => void;
    };
  }
}

export interface TurnstileHandle {
  getToken: () => string | undefined;
  reset: () => void;
}

interface Props {
  // Cloudflare site key. Use 1x00000000000000000000AA in dev — always
  // returns a passing token, useful for local testing without a real key.
  siteKey: string;
  onTokenChange?: (token: string | undefined) => void;
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load Turnstile script"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile(
  { siteKey, onTokenChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | undefined>(undefined);

  // Keep the latest onTokenChange in a ref so the render effect below does
  // NOT depend on it. Without this, every parent re-render (every keystroke
  // in the chat input) re-creates the onTokenChange function identity,
  // re-runs the effect, and remounts the widget — which Cloudflare renders
  // as a flicker / re-load on every keystroke.
  const onTokenChangeRef = useRef(onTokenChange);
  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  });

  useImperativeHandle(ref, () => ({
    getToken: () => tokenRef.current,
    reset: () => {
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current);
        tokenRef.current = undefined;
        onTokenChangeRef.current?.(undefined);
      }
    },
  }));

  // Only mount/remount when siteKey changes — i.e. essentially never.
  useEffect(() => {
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => {
          tokenRef.current = token;
          onTokenChangeRef.current?.(token);
        },
        "expired-callback": () => {
          tokenRef.current = undefined;
          onTokenChangeRef.current?.(undefined);
        },
        "error-callback": () => {
          tokenRef.current = undefined;
          onTokenChangeRef.current?.(undefined);
        },
        theme: "light",
        appearance: "interaction-only",
      });
    });
    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  return <div ref={containerRef} />;
});
