// TimerTrigger — every 5 minutes, pause Fabric if idle for > AW_PBI_IDLE_PAUSE_MINUTES.
// Belt-and-suspenders against runaway capacity cost. Heartbeat into
// console.log so App Insights captures each successful pause-check.

import { app, type InvocationContext, type Timer } from "@azure/functions";
import { getCapacity, pauseCapacity, readLastActivity } from "../lib/pbi-client.js";

const SCHEDULE = "0 */5 * * * *"; // every 5 minutes

app.timer("idlePauseTimer", {
  schedule: SCHEDULE,
  handler: async (_t: Timer, ctx: InvocationContext): Promise<void> => {
    const idleMin = Number(process.env.AW_PBI_IDLE_PAUSE_MINUTES ?? "30");
    const idleMs = idleMin * 60_000;
    try {
      const info = await getCapacity();
      if (info.state !== "Active") {
        ctx.log(`idlePauseTimer: state=${info.state}, nothing to do`);
        return;
      }
      const last = await readLastActivity();
      const sinceMs = last ? Date.now() - last : Infinity;
      if (sinceMs > idleMs) {
        ctx.log(`idlePauseTimer: idle for ${Math.round(sinceMs / 60_000)}min, pausing`);
        await pauseCapacity();
      } else {
        ctx.log(
          `idlePauseTimer: last activity ${Math.round(sinceMs / 60_000)}min ago, holding`,
        );
      }
    } catch (err) {
      ctx.error("idlePauseTimer failed", err);
    }
  },
});
