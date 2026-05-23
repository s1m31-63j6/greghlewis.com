// Canonical "try one of these" prompts. Each is chosen to exercise a
// different SQL shape (top-N aggregation, YoY, demographic segmentation,
// trend, reseller ranking).

export const STARTERS: string[] = [
  "Top 5 product categories by internet sales in 2013",
  "Year-over-year sales growth by sales territory region",
  "Which customer income brackets buy the most bikes?",
  "Top 10 resellers by 2013 sales with country and business type",
  "Monthly internet sales trend in 2013 for the Bikes category",
];
