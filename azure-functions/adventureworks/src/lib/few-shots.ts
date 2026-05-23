// Few-shot SQL examples for in-context learning. These are paired into
// the system prompt to anchor the model on the JOIN patterns, the
// DimDate-vs-raw-datetime convention, and the TOP-N + ORDER BY shape.
//
// Keep these CORRECT — they get cached into the model's reasoning. If
// you add or change one, smoke-test it against a live AdventureWorksDW
// before merging.

export interface FewShot {
  question: string;
  sql: string;
}

export const FEW_SHOTS: FewShot[] = [
  {
    question: "What were the top 5 product categories by internet sales in 2013?",
    sql: `SELECT TOP 5
  pc.EnglishProductCategoryName AS Category,
  SUM(fis.SalesAmount) AS TotalSales
FROM FactInternetSales fis
JOIN DimProduct p ON p.ProductKey = fis.ProductKey
JOIN DimProductSubcategory psc ON psc.ProductSubcategoryKey = p.ProductSubcategoryKey
JOIN DimProductCategory pc ON pc.ProductCategoryKey = psc.ProductCategoryKey
JOIN DimDate d ON d.DateKey = fis.OrderDateKey
WHERE d.CalendarYear = 2013
GROUP BY pc.EnglishProductCategoryName
ORDER BY TotalSales DESC;`,
  },
  {
    question: "Show year-over-year internet sales growth by sales territory region.",
    sql: `WITH yearly AS (
  SELECT
    st.SalesTerritoryRegion AS Region,
    d.CalendarYear AS Year,
    SUM(fis.SalesAmount) AS Sales
  FROM FactInternetSales fis
  JOIN DimDate d ON d.DateKey = fis.OrderDateKey
  JOIN DimSalesTerritory st ON st.SalesTerritoryKey = fis.SalesTerritoryKey
  GROUP BY st.SalesTerritoryRegion, d.CalendarYear
)
SELECT
  curr.Region,
  curr.Year,
  curr.Sales AS CurrentSales,
  prev.Sales AS PriorSales,
  CAST((curr.Sales - prev.Sales) / NULLIF(prev.Sales, 0) AS DECIMAL(10,4)) AS YoYGrowth
FROM yearly curr
LEFT JOIN yearly prev
  ON prev.Region = curr.Region AND prev.Year = curr.Year - 1
ORDER BY curr.Region, curr.Year;`,
  },
  {
    question: "Which customer income brackets buy the most bikes?",
    sql: `SELECT
  CASE
    WHEN c.YearlyIncome < 40000 THEN '<40K'
    WHEN c.YearlyIncome < 70000 THEN '40-70K'
    WHEN c.YearlyIncome < 100000 THEN '70-100K'
    ELSE '100K+'
  END AS IncomeBracket,
  COUNT(DISTINCT fis.SalesOrderNumber) AS Orders,
  SUM(fis.SalesAmount) AS TotalSales
FROM FactInternetSales fis
JOIN DimCustomer c ON c.CustomerKey = fis.CustomerKey
JOIN DimProduct p ON p.ProductKey = fis.ProductKey
JOIN DimProductSubcategory psc ON psc.ProductSubcategoryKey = p.ProductSubcategoryKey
JOIN DimProductCategory pc ON pc.ProductCategoryKey = psc.ProductCategoryKey
WHERE pc.EnglishProductCategoryName = N'Bikes'
GROUP BY
  CASE
    WHEN c.YearlyIncome < 40000 THEN '<40K'
    WHEN c.YearlyIncome < 70000 THEN '40-70K'
    WHEN c.YearlyIncome < 100000 THEN '70-100K'
    ELSE '100K+'
  END
ORDER BY TotalSales DESC;`,
  },
  {
    question: "Top 10 resellers by 2013 sales, with their country and business type.",
    sql: `SELECT TOP 10
  r.ResellerName,
  r.BusinessType,
  g.EnglishCountryRegionName AS Country,
  SUM(frs.SalesAmount) AS TotalSales,
  COUNT(DISTINCT frs.SalesOrderNumber) AS Orders
FROM FactResellerSales frs
JOIN DimReseller r ON r.ResellerKey = frs.ResellerKey
JOIN DimGeography g ON g.GeographyKey = r.GeographyKey
JOIN DimDate d ON d.DateKey = frs.OrderDateKey
WHERE d.CalendarYear = 2013
GROUP BY r.ResellerName, r.BusinessType, g.EnglishCountryRegionName
ORDER BY TotalSales DESC;`,
  },
  {
    question: "Monthly internet sales trend in 2013 for the Bikes category.",
    sql: `SELECT
  d.CalendarYear AS Year,
  d.MonthNumberOfYear AS MonthNum,
  d.EnglishMonthName AS Month,
  SUM(fis.SalesAmount) AS Sales,
  COUNT(DISTINCT fis.SalesOrderNumber) AS Orders
FROM FactInternetSales fis
JOIN DimDate d ON d.DateKey = fis.OrderDateKey
JOIN DimProduct p ON p.ProductKey = fis.ProductKey
JOIN DimProductSubcategory psc ON psc.ProductSubcategoryKey = p.ProductSubcategoryKey
JOIN DimProductCategory pc ON pc.ProductCategoryKey = psc.ProductCategoryKey
WHERE d.CalendarYear = 2013 AND pc.EnglishProductCategoryName = N'Bikes'
GROUP BY d.CalendarYear, d.MonthNumberOfYear, d.EnglishMonthName
ORDER BY MonthNum;`,
  },
];

export function renderFewShots(): string {
  return FEW_SHOTS.map(
    (fs, i) =>
      `### Example ${i + 1}\nQuestion: ${fs.question}\nSQL:\n\`\`\`sql\n${fs.sql}\n\`\`\``,
  ).join("\n\n");
}
