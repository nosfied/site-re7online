import http from "k6/http";
import { check } from "k6";
import {
  apiUrl,
  appAuthHeadersForToken,
  config,
  loginAllAppUsers,
  pickToken,
  scenarioOptions,
  sleepBetweenRequests,
} from "./lib/config.js";

export const options = scenarioOptions({
  http_req_duration: ["p(95)<1500"],
});

export function setup() {
  return { tokens: loginAllAppUsers() };
}

export default function (data) {
  const params = appAuthHeadersForToken(pickToken(data.tokens));
  const query = encodeURIComponent(config.searchQuery);
  const res = http.get(apiUrl(`/app/search?q=${query}&limit=10`), params);
  check(res, {
    "search is 200": (r) => r.status === 200,
    "search response is json": (r) => String(r.headers["Content-Type"] || "").includes("application/json"),
  });
  sleepBetweenRequests();
}
