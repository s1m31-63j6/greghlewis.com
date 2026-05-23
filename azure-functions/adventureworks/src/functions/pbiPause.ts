// POST /pbi/pause — explicit user-initiated capacity pause.

import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { pauseCapacity, getCapacity } from "../lib/pbi-client.js";

app.http("pbiPause", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "pbi/pause",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") return cors(204);
    try {
      const info = await getCapacity();
      if (info.state === "Paused" || info.state === "Pausing") {
        return json(200, { state: info.state, message: "already paused" });
      }
      await pauseCapacity();
      return json(202, { state: "Pausing" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json(500, { error: msg });
    }
  },
});

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

function cors(status: number): HttpResponseInit {
  return {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  };
}
