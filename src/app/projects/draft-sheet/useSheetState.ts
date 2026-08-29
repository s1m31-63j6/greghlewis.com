"use client";

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe } from "./sheetStore";

/** The league config and this viewer's marks, read from the external store. */
export function useSheetState() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
