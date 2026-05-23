// Server-Sent Events encoder. Wraps a ReadableStream so handlers can
// `await emit({type:"...", ...})` without managing the writer directly.

import type { StreamEvent } from "./types.js";

export interface SseStream {
  readable: ReadableStream<Uint8Array>;
  emit: (event: StreamEvent) => Promise<void>;
  close: () => Promise<void>;
  abort: (err: unknown) => Promise<void>;
}

export function createSseStream(): SseStream {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  let closed = false;

  const emit = async (event: StreamEvent): Promise<void> => {
    if (closed) return;
    const line = `data: ${JSON.stringify(event)}\n\n`;
    controller.enqueue(encoder.encode(line));
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // already closed
    }
  };

  const abort = async (err: unknown): Promise<void> => {
    if (closed) return;
    closed = true;
    try {
      controller.error(err);
    } catch {
      // already closed
    }
  };

  return { readable, emit, close, abort };
}
