import { healthPayload } from "../src/market-data.js";

export const config = { runtime: "edge" };

export default function health() {
  return Response.json(healthPayload(), {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
