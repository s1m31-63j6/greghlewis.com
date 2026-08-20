// Crawlers would otherwise dominate a low-traffic portfolio site and make
// every number a lie. Filtering happens server-side, before the write, so
// bot traffic costs a Lambda invocation and nothing else.

const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl|wget|python-requests|axios|go-http|java\/|okhttp|scrapy|facebookexternalhit|whatsapp|telegram|slackbot|discordbot|linkedinbot|twitterbot|embedly|preview/i;

export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true; // no UA at all is not a browser we care about
  return BOT_UA.test(userAgent);
}
