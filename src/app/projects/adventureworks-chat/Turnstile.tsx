"use client";

// Cloudflare Turnstile widget — direct port from
// src/app/projects/religious-voices/Turnstile.tsx. See that file for the
// rationale on the onTokenChangeRef pattern (avoids widget remount on
// every keystroke in the parent's input).

import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

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
