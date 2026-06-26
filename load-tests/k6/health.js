import http from "k6/http";
import { check } from "k6";
import { apiUrl, requestParams, scenarioOptions, sleepBetweenRequests } from "./lib/config.js";

export const options = scenarioOptions({
  http_req_duration: ["p(95)<500"],
});

export default function () {
  const res = http.get(apiUrl("/health"), requestParams());
  check(res, {
    "health status is 200": (r) => r.status === 200,
    "health db is ok": (r) => String(r.body || "").includes('"db":"ok"'),
  });
  sleepBetweenRequests();
}
