"use client";

// Collapsed-by-default overview of AdventureWorksDW. Helps a first-time
// visitor know what the chat can actually answer before they ask.

const SECTIONS: { title: string; tables: { name: string; note: string }[] }[] = [
  {
    title: "Fact tables (what happened)",
    tables: [
      { name: "FactInternetSales", note: "Direct-to-consumer orders" },
      { name: "FactResellerSales", note: "Wholesale channel" },
      { name: "FactProductInventory", note: "Daily snapshots" },
      { name: "FactCallCenter", note: "Daily call-center ops" },
    ],
  },
  {
    title: "Dimensions (the who / what / where / when)",
    tables: [
      { name: "DimDate", note: "Calendar — join on OrderDateKey" },
      { name: "DimCustomer", note: "18K end-customers, demographics" },
      { name: "DimProduct + Subcategory + Category", note: "SKU catalog" },
      { name: "DimSalesTerritory", note: "Region / Country / Group" },
      { name: "DimReseller", note: "~700 wholesale accounts" },
      { name: "DimEmployee", note: "Salespeople (with hierarchy)" },
      { name: "DimGeography", note: "Cities / states / countries" },
      { name: "DimPromotion, DimCurrency, DimAccount", note: "Lookups" },
    ],
  },
];

export function SchemaOverview() {
  return (
    <details className="rounded-lg border border-stone-200 bg-stone-50/50 px-4 py-3 text-sm">
      <summary className="cursor-pointer text-stone-700 font-medium select-none">
        What is AdventureWorksDW?
      </summary>
      <div className="mt-3 space-y-4 text-stone-600 text-[13px] leading-relaxed">
        <p>
          Microsoft&apos;s canonical sales-warehouse sample. A fictional bike
          company (Adventure Works Cycles) selling 2010–2014, with ~60K
          internet orders, ~60K reseller orders, and 700 dimension
          tables. Denormalized star schema — joins are cheap, queries
          are forgiving.
        </p>
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <div className="text-[11px] uppercase tracking-wider text-stone-500 mb-1.5">
              {s.title}
            </div>
            <ul className="space-y-0.5">
              {s.tables.map((t) => (
                <li key={t.name} className="flex gap-2">
                  <code className="text-[12px] text-stone-900 font-mono">{t.name}</code>
                  <span className="text-stone-500">— {t.note}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-[12px] text-stone-500 italic">
          Years in the data: 2010–2014. Currency: USD-equivalent via DimCurrency.
        </p>
      </div>
    </details>
  );
}
