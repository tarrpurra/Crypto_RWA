import type { FundingRateItem, FundingRatesResponse } from "@/lib/api";

export type AggregatedFundingSnapshot = {
  fundingRate: number | null;
  nextFundingRate: number | null;
  sources: number;
  nextSources: number;
};

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: Array<number | null | undefined>): {
  value: number | null;
  count: number;
} {
  const valid = values.filter((value): value is number => value !== null && value !== undefined);
  if (valid.length === 0) {
    return { value: null, count: 0 };
  }
  const total = valid.reduce((sum, value) => sum + value, 0);
  return {
    value: total / valid.length,
    count: valid.length,
  };
}

function collectVenueItems(
  symbol: string,
  response: FundingRatesResponse | undefined,
): FundingRateItem[] {
  if (!response) {
    return [];
  }

  const collected: FundingRateItem[] = [];
  const primary = response.rates[symbol];
  if (primary) {
    collected.push(primary);
  }

  Object.values(response.venues ?? {}).forEach((venueRates) => {
    const venueItem = venueRates[symbol];
    if (venueItem) {
      collected.push(venueItem);
    }
  });

  return collected;
}

export function getAggregatedFundingSnapshot(
  symbol: string,
  response: FundingRatesResponse | undefined,
): AggregatedFundingSnapshot {
  const items = collectVenueItems(symbol, response);
  const funding = average(items.map((item) => toNumber(item.funding_rate)));
  const nextFunding = average(items.map((item) => toNumber(item.next_funding_rate)));

  return {
    fundingRate: funding.value,
    nextFundingRate: nextFunding.value,
    sources: funding.count,
    nextSources: nextFunding.count,
  };
}

export function formatFundingRatePercent(value: number | null): string {
  if (value === null) {
    return "-";
  }

  const percentage = value * 100;
  const abs = Math.abs(percentage);
  let decimals = 3;
  if (abs < 0.01) {
    decimals = 5;
  } else if (abs < 0.1) {
    decimals = 4;
  }

  return `${percentage.toFixed(decimals)}%`;
}

export function parseFundingNumber(value: string | null | undefined): number | null {
  return toNumber(value);
}
