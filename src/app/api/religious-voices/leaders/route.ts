import { signedFetch } from "@/lib/religious-voices/lambda-client";

export const runtime = "nodejs";
// Cache the leader list for 5 minutes — it only changes when the corpus
// is rebuilt, which doesn't happen at request time.
export const revalidate = 300;

export async function GET() {
  try {
    const upstream = await signedFetch("/leaders");
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return Response.json(
        { error: `Upstream HTTP ${upstream.status}: ${errText.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const data = await upstream.json();
    return Response.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const cause =
      e instanceof Error && e.cause
        ? e.cause instanceof Error
          ? `${e.cause.name}: ${e.cause.message}`
          : String(e.cause)
        : null;
    const envSnapshot = {
      lambdaUrlSet: !!process.env.RELIGIOUS_VOICES_LAMBDA_URL,
      lambdaUrlValue: process.env.RELIGIOUS_VOICES_LAMBDA_URL?.slice(0, 60),
      awsRegion: process.env.AWS_REGION,
      awsAccessKey: process.env.AWS_ACCESS_KEY_ID ? "set" : "unset",
      lambdaTaskRoot: process.env.LAMBDA_TASK_ROOT,
    };
    console.error("[religious-voices][proxy/leaders]", message, cause, envSnapshot);
    return Response.json(
      { error: message, cause, envSnapshot, leaders: [], total: 0 },
      { status: 200 },
    );
  }
}
