// POST /pbi/resume — resume Fabric capacity, wait for Active, generate
// embed token. Returns embedUrl + token in JSON.

import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import {
  getCapacity,
  resumeCapacity,
  waitForActive,
  generateEmbedToken,
  recordActivity,
} from "../lib/pbi-client.js";

app.http("pbiResume", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "pbi/resume",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") return cors(204);

    try {
      const before = await getCapacity();
      if (before.state !== "Active") {
        await resumeCapacity();
      }
      const finalState = await waitForActive(180_000);
      if (finalState !== "Active") {
        return json(503, {
          error: "Capacity did not reach Active state within 3 minutes.",
          state: finalState,
        });
      }
      await recordActivity();
      const embed = await generateEmbedToken();
      return json(200, { state: "Active", ...embed });
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
      "Access-Control-Max-Age": "86400",
    },
  };
}
