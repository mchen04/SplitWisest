import { neonConfig } from "@neondatabase/serverless";

// Local-development escape hatch. When NEON_LOCAL_PROXY is set (to a local
// neon-proxy SQL-over-HTTP endpoint such as `http://localhost:4444/sql`), point
// the Neon serverless driver at that proxy in front of a plain Postgres, so the
// app can run and be verified end-to-end without a hosted Neon account.
//
// This is INERT in production: when NEON_LOCAL_PROXY is unset the driver behaves
// exactly as before (it talks to the real Neon endpoint derived from
// DATABASE_URL). It never changes the fail-closed behavior in db.ts — a missing
// DATABASE_URL still throws at import. See docs/DATABASE.md ("Local Postgres").
const localEndpoint = process.env.NEON_LOCAL_PROXY;
if (localEndpoint) {
  neonConfig.fetchEndpoint = () => localEndpoint;
  neonConfig.useSecureWebSocket = false;
  neonConfig.poolQueryViaFetch = true;
}
