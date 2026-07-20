/**
 * Lambda entry point. Streams the pipeline trace as SSE.
 *
 * Uses a Function URL in RESPONSE_STREAM invoke mode, which was measured to
 * deliver frames incrementally from 0.4s out past 90s. The Amplify SSR route
 * cannot host this: it buffers the whole response and CloudFront terminates the
 * origin at ~30s.
 *
 * NOTE for deployment: a public Function URL needs BOTH `lambda:InvokeFunctionUrl`
 * AND `lambda:InvokeFunction` in the resource policy. With only the first it
 * returns 403 forever.
 */

import { run } from "./pipeline.js";
import type { StreamEvent } from "./events.js";

declare const awslambda: {
  streamifyResponse: (
    fn: (event: any, responseStream: any, context: any) => Promise<void>,
  ) => unknown;
  HttpResponseStream: {
    from: (stream: any, meta: { statusCode: number; headers: Record<string, string> }) => any;
  };
};

// CORS headers are NOT set here. The Function URL's own CORS config emits them,
// and setting them again from the handler produced TWO
// `access-control-allow-origin` headers — which browsers reject outright
// ("contains multiple values"), breaking the page while curl looked fine.

function question(event: any): string | null {
  const method = event?.requestContext?.http?.method ?? "GET";
  if (method === "POST" && event?.body) {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    try {
      return JSON.parse(raw)?.question ?? null;
    } catch {
      return null;
    }
  }
  return event?.queryStringParameters?.q ?? null;
}

export const handler = awslambda.streamifyResponse(
  async (event: any, responseStream: any): Promise<void> => {
    const stream = awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });

    const send = (e: StreamEvent) => stream.write(`data: ${JSON.stringify(e)}\n\n`);

    try {
      const q = question(event)?.trim();
      if (!q) {
        send({ type: "error", message: "missing question" });
        return;
      }
      if (q.length > 500) {
        send({ type: "error", message: "question too long" });
        return;
      }
      await run(q, send);
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      console.error("[glass-box-rag]", message, e);
      send({ type: "error", message });
    } finally {
      stream.end();
    }
  },
);
