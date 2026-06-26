import http from "k6/http";
import { check } from "k6";
import {
  apiUrl,
  appAuthHeadersForToken,
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
  const list = http.get(apiUrl("/app/conversations?limit=20"), params);
  check(list, {
    "conversation list is 200": (r) => r.status === 200,
    "conversation list response is json": (r) => String(r.headers["Content-Type"] || "").includes("application/json"),
  });

  sleepBetweenRequests();
}
