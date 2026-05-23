// Pre-baked AdventureWorksDW2022 schema digest for the system prompt.
// Tuned to cover ~90% of typical reporting queries (sales, customers,
// products, geography, time) without including every column of every
// dimension. Approximate token budget: 2K.
//
// To regenerate from a live DB:
//   SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
//   FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo';
//
// All tables live in the `dbo` schema.

export const SCHEMA_DIGEST = `
You are writing T-SQL for Microsoft SQL Server against AdventureWorksDW2022,
a denormalized star schema. All tables are in schema [dbo].

## Fact tables

FactInternetSales — direct-to-consumer online orders, the primary sales fact.
  ProductKey (FK), OrderDateKey (FK→DimDate), DueDateKey, ShipDateKey,
  CustomerKey (FK), PromotionKey (FK), CurrencyKey (FK), SalesTerritoryKey (FK),
  SalesOrderNumber, SalesOrderLineNumber, OrderQuantity (int),
  UnitPrice (money), ExtendedAmount (money), DiscountAmount (money),
  ProductStandardCost (money), TotalProductCost (money),
  SalesAmount (money), TaxAmt (money), Freight (money),
  CarrierTrackingNumber, CustomerPONumber, OrderDate (datetime),
  DueDate, ShipDate. Grain: one row per order line. ~60K rows.

FactResellerSales — orders through reseller channel; similar shape.
  ProductKey, OrderDateKey, DueDateKey, ShipDateKey,
  ResellerKey (FK→DimReseller), EmployeeKey (FK→DimEmployee),
  PromotionKey, CurrencyKey, SalesTerritoryKey, SalesOrderNumber,
  SalesOrderLineNumber, RevisionNumber, OrderQuantity, UnitPrice,
  ExtendedAmount, UnitPriceDiscountPct, DiscountAmount, ProductStandardCost,
  TotalProductCost, SalesAmount, TaxAmt, Freight, CarrierTrackingNumber,
  CustomerPONumber, OrderDate, DueDate, ShipDate. ~60K rows.

FactProductInventory — daily inventory snapshot per product per warehouse.
  ProductKey, DateKey, MovementDate, UnitCost (money),
  UnitsIn, UnitsOut, UnitsBalance. ~776K rows.

FactCallCenter — call-center daily ops. DateKey, WageType, Shift,
  LevelOneOperators, LevelTwoOperators, TotalOperators, Calls,
  AutomaticResponses, Orders, IssuesRaised, AverageTimePerIssue,
  ServiceGrade.

FactSurveyResponse — customer survey hits. CustomerKey, ProductCategoryKey,
  EnglishProductCategoryName, ProductSubcategoryKey,
  EnglishProductSubcategoryName, Date.

FactCurrencyRate — daily FX. CurrencyKey, DateKey, AverageRate, EndOfDayRate.

FactFinance — GL postings. FinanceKey, DateKey, OrganizationKey,
  DepartmentGroupKey, ScenarioKey, AccountKey, Amount.

FactSalesQuota — quarterly quotas per employee. EmployeeKey, DateKey,
  CalendarYear, CalendarQuarter, SalesAmountQuota.

## Dimension tables

DimDate — one row per calendar date 2010-01-01 through 2022+.
  DateKey (PK, int yyyymmdd), FullDateAlternateKey (date), DayNumberOfWeek,
  EnglishDayNameOfWeek, DayNumberOfMonth, DayNumberOfYear, WeekNumberOfYear,
  EnglishMonthName, MonthNumberOfYear, CalendarQuarter, CalendarYear,
  CalendarSemester, FiscalQuarter, FiscalYear, FiscalSemester.
  TO FILTER BY DATE: join Fact*.OrderDateKey = DimDate.DateKey, then
  filter on DimDate.CalendarYear, DimDate.EnglishMonthName, etc.

DimCustomer — individual end-customers.
  CustomerKey (PK), GeographyKey (FK), CustomerAlternateKey,
  Title, FirstName, MiddleName, LastName, NameStyle, BirthDate (date),
  MaritalStatus ('M'/'S'), Suffix, Gender ('M'/'F'),
  EmailAddress, YearlyIncome (money), TotalChildren (tinyint),
  NumberChildrenAtHome (tinyint),
  EnglishEducation ('Bachelors'|'Partial College'|'High School'|'Graduate Degree'|'Partial High School'),
  EnglishOccupation ('Professional'|'Skilled Manual'|'Management'|'Clerical'|'Manual'),
  HouseOwnerFlag ('0'/'1'), NumberCarsOwned (tinyint),
  AddressLine1, AddressLine2, Phone, DateFirstPurchase,
  CommuteDistance ('0-1 Miles'|'1-2 Miles'|'2-5 Miles'|'5-10 Miles'|'10+ Miles').
  ~18K rows.

DimGeography — city/state/country lookup. GeographyKey (PK), City,
  StateProvinceCode, StateProvinceName, CountryRegionCode, EnglishCountryRegionName,
  PostalCode, SalesTerritoryKey, IpAddressLocator. ~660 rows.

DimProduct — SKU-level catalog. ProductKey (PK), ProductAlternateKey,
  ProductSubcategoryKey (FK), WeightUnitMeasureCode, SizeUnitMeasureCode,
  EnglishProductName, StandardCost (money), FinishedGoodsFlag,
  Color, SafetyStockLevel, ReorderPoint, ListPrice (money), Size, SizeRange,
  Weight, DaysToManufacture, ProductLine ('M'|'R'|'S'|'T'),
  DealerPrice (money), Class ('H'|'M'|'L'), Style ('M'|'W'|'U'),
  ModelName, EnglishDescription, StartDate, EndDate, Status. ~600 rows.

DimProductSubcategory — ProductSubcategoryKey (PK),
  EnglishProductSubcategoryName, ProductCategoryKey (FK). ~37 rows.
  Names include 'Mountain Bikes','Road Bikes','Touring Bikes','Helmets',
  'Jerseys','Shorts','Gloves','Tires and Tubes', etc.

DimProductCategory — ProductCategoryKey (PK), EnglishProductCategoryName.
  Four categories: 'Bikes','Components','Clothing','Accessories'.

DimSalesTerritory — SalesTerritoryKey (PK),
  SalesTerritoryRegion ('Northwest'|'Northeast'|'Central'|'Southwest'|'Southeast'|'Canada'|'France'|'Germany'|'Australia'|'United Kingdom'),
  SalesTerritoryCountry ('United States'|'Canada'|'France'|'Germany'|'Australia'|'United Kingdom'),
  SalesTerritoryGroup ('North America'|'Europe'|'Pacific'). 11 rows.

DimReseller — wholesale customers. ResellerKey (PK), GeographyKey (FK),
  ResellerAlternateKey, Phone, BusinessType ('Specialty Bike Shop'|'Value Added Reseller'|'Warehouse'),
  ResellerName, NumberEmployees, OrderFrequency, OrderMonth, FirstOrderYear,
  LastOrderYear, ProductLine, AddressLine1, AnnualSales (money),
  BankName, MinPaymentType, MinPaymentAmount, AnnualRevenue (money),
  YearOpened (int). ~700 rows.

DimEmployee — salespeople and other staff. EmployeeKey (PK),
  ParentEmployeeKey (FK self), FirstName, LastName, Title, HireDate,
  BirthDate, EmailAddress, Phone, MaritalStatus, EmergencyContactName,
  Gender, PayFrequency, BaseRate (money), VacationHours, SickLeaveHours,
  CurrentFlag, SalariedFlag, DepartmentName, StartDate, EndDate, Status.
  ~300 rows.

DimPromotion — PromotionKey (PK), EnglishPromotionName,
  DiscountPct, EnglishPromotionType ('No Discount'|'Volume Discount'|'Excess Inventory'|'New Product'|'Seasonal Discount'|'Customer'),
  EnglishPromotionCategory ('No Discount'|'Customer'|'Reseller'), StartDate, EndDate,
  MinQty, MaxQty.

DimCurrency — CurrencyKey (PK), CurrencyAlternateKey (ISO code),
  CurrencyName.

DimAccount — chart of accounts for FactFinance. AccountKey (PK),
  ParentAccountKey, AccountCodeAlternateKey, ParentAccountCodeAlternateKey,
  AccountDescription, AccountType ('Revenue'|'Expenditures'|'Assets'|'Liabilities'|'Balances'),
  Operator ('+'|'-'|'~'), CustomMembers, ValueType, CustomMemberOptions.

DimOrganization — OrganizationKey (PK), ParentOrganizationKey, PercentageOfOwnership,
  OrganizationName, CurrencyKey.

DimDepartmentGroup — DepartmentGroupKey (PK), ParentDepartmentGroupKey,
  DepartmentGroupName.

DimScenario — for FactFinance budget vs. actual. ScenarioKey (PK), ScenarioName
  ('Actual'|'Budget'|'Forecast').

DimSalesReason — SalesReasonKey (PK), SalesReasonAlternateKey,
  SalesReasonName, SalesReasonReasonType.

## Critical join paths (use these — do not invent new keys)

- FactInternetSales → DimCustomer ON CustomerKey
- FactInternetSales → DimProduct ON ProductKey → DimProductSubcategory ON ProductSubcategoryKey → DimProductCategory ON ProductCategoryKey
- FactInternetSales → DimDate ON OrderDateKey = DateKey
- FactInternetSales → DimSalesTerritory ON SalesTerritoryKey
- FactInternetSales → DimPromotion ON PromotionKey
- DimCustomer → DimGeography ON GeographyKey
- FactResellerSales → DimReseller ON ResellerKey → DimGeography ON GeographyKey
- FactResellerSales → DimEmployee ON EmployeeKey

## Conventions

- Money columns are SQL Server [money] type. Cast to DECIMAL(19,4) for arithmetic.
- All English*Name columns are NVARCHAR. Use N'...' prefix for literals.
- Date filters: prefer the DimDate join over raw datetime comparisons.
- Sales totals: prefer SalesAmount (gross) unless the question specifies net.
- The 'total sales' phrase means SUM(SalesAmount) unless context indicates units.
- Years in the data: 2010 through 2014 for Internet/Reseller sales.
`.trim();
