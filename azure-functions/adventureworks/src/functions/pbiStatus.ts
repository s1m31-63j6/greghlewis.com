// GET /pbi/status — current Fabric capacity state, plus the last-activity
// heartbeat. Front-end polls this every 3-5s while the launcher modal is
// open.

import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { getCapacity, readLastActivity, recordActivity } from "../lib/pbi-client.js";
import type { PbiStatus } from "../lib/types.js";

app.http("pbiStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "pbi/status",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") return cors(204);
    try {
      const info = await getCapacity();
      // Tick the heartbeat: if anyone is polling status, someone's interested.
      // The idle-pause timer reads this to decide whether to suspend.
      void recordActivity().catch(() => undefined);
      const lastMs = await readLastActivity();
      const status: PbiStatus = {
        state: info.state,
        last_activity_at: lastMs ? new Date(lastMs).toISOString() : null,
        capacity_name: process.env.AW_FABRIC_CAPACITY_NAME ?? "",
      };
      return json(200, status);
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  };
}
