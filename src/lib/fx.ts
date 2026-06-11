import { sql } from "./db";
import { CURRENCIES } from "./currencies";
export { CURRENCIES };

// Fallback approximate rates (units per USD) used if the live fetch fails and
// the cache is empty. Conversion rates are snapshotted onto each expense at
// creation time, so later rate drift never changes recorded balances.
const FALLBACK_PER_USD: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.52, JPY: 155, INR: 84,
  MXN: 18.2, CNY: 7.2, KRW: 1370, CHF: 0.89, SEK: 10.5, NZD: 1.64, BRL: 5.4,
};

const MAX_AGE_MS = 24 * 3600 * 1000;

export async function getRatesPerUsd(): Promise<Record<string, number>> {
  const cached = await sql`SELECT currency, rate_per_usd, fetched_at FROM fx_rates`;
  const oldest = cached.reduce(
    (min, r) => Math.min(min, new Date(r.fetched_at).getTime()),
    Infinity
  );
  const fresh = cached.length > 0 && Date.now() - oldest < MAX_AGE_MS;
  if (fresh) {
    return Object.fromEntries(cached.map((r) => [r.currency, Number(r.rate_per_usd)]));
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    if (json?.result === "success" && json.rates) {
      const rates: Record<string, number> = {};
      for (const c of CURRENCIES) {
        if (json.rates[c]) rates[c] = json.rates[c];
      }
      for (const [c, r] of Object.entries(rates)) {
        await sql`INSERT INTO fx_rates (currency, rate_per_usd, fetched_at)
                  VALUES (${c}, ${r}, now())
                  ON CONFLICT (currency) DO UPDATE SET rate_per_usd = ${r}, fetched_at = now()`;
      }
      return rates;
    }
  } catch {
    // fall through to cache/fallback
  }
  if (cached.length > 0) {
    return Object.fromEntries(cached.map((r) => [r.currency, Number(r.rate_per_usd)]));
  }
  return FALLBACK_PER_USD;
}

// Convert amountCents in `from` currency to cents in `to` currency.
export async function convert(amountCents: number, from: string, to: string): Promise<{ cents: number; rate: number }> {
  if (from === to) return { cents: amountCents, rate: 1 };
  const rates = await getRatesPerUsd();
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) throw new Error(`Unsupported currency ${from} or ${to}`);
  const rate = toRate / fromRate;
  return { cents: Math.round(amountCents * rate), rate };
}
