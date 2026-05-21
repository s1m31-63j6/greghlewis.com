import leadersJson from "@/lib/religious-voices/leaders.json";

export const runtime = "nodejs";
// The bundled leaders.json only changes when the corpus is rebuilt
// (deploy-time), so static caching is safe.
export const revalidate = 3600;

export function GET() {
  return Response.json(leadersJson);
}
