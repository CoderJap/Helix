"use client";

import nextDynamic from "next/dynamic";

const PricingTable = nextDynamic(
  () => import("@clerk/nextjs").then((module) => module.PricingTable),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Loading pricing options...
      </div>
    ),
  },
);

export const PricingTableClient = () => {
  return (
    <PricingTable
      appearance={{
        elements: {
          pricingTableCard: "border! shadow-none! rounded-lg!",
        },
      }}
    />
  );
};

export default PricingTableClient;
