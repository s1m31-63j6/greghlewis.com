/** Run the pipeline locally against real Bedrock, printing the SSE trace. */
import { run } from "./pipeline.js";
import type { StreamEvent } from "./events.js";

const q = process.argv.slice(2).join(" ") || "Does market dilution from competing AI-generated works defeat fair use?";
const t0 = Date.now();
let answer = "";

const emit = (e: StreamEvent) => {
  const t = ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
  switch (e.type) {
    case "stage_start": return console.log(`${t}s  ▶ [hop ${e.hop}] ${e.label}`);
    case "stage_end": {
      const n = e.docs ? ` → ${e.docs.length} docs` : "";
      const d = e.detail ? ` ${JSON.stringify(e.detail)}` : "";
      return console.log(`${t}s  ✓ ${e.stage} (${e.ms}ms)${n}${d}`);
    }
    case "analysis": return console.log(`${t}s  ANALYSIS intent="${e.intent}" as_of=${e.as_of} factors=${JSON.stringify(e.factors)}`);
    case "transform": return console.log(`${t}s  HYDE(${e.hyde.length} chars) variants=${e.variants.length}`);
    case "assessment": return console.log(`${t}s  ASSESS sufficient=${e.sufficient} follow=${e.follow.map(f=>f.case_name).join(", ")||"none"}\n        ${e.reasoning}`);
    case "text": answer += e.content; return;
    case "citations": return console.log(`\n${t}s  CITED: ${e.cases.map(c=>c.case_name).join(" | ")}`);
    case "meta": return console.log(`${t}s  META total=${(e.total_ms/1000).toFixed(1)}s hops=${e.hops} tokens=${e.input_tokens}/${e.output_tokens}`);
    case "error": return console.error(`${t}s  ERROR ${e.message}`);
    case "done": return console.log(`\n--- ANSWER ---\n${answer.trim()}\n`);
  }
};

await run(q, emit);
