// Single source of truth for supported currency codes. Kept dependency-free so
// both server (fx.ts) and client (client.ts) can import it without pulling in
// the database driver.
export const CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR", "MXN", "CNY", "KRW", "CHF", "SEK", "NZD", "BRL",
];
