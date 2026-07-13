import { handleMarketData } from "../src/market-data.js";

export const config = { runtime: "edge" };

export default function marketData(request) {
  return handleMarketData(request, new URL(request.url));
}
