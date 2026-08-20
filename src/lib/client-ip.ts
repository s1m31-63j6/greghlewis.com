// Client IP extraction for request-scoped concerns (rate limiting, visitor
// hashing). Behind Amplify's CloudFront the real client address is the first
// entry in x-forwarded-for; everything after it is proxy hops.

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
