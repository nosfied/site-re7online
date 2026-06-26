import http from "k6/http";
import { check } from "k6";
import { apiUrl, publicApiHeaders, scenarioOptions, sleepBetweenRequests } from "./lib/config.js";

export const options = scenarioOptions({
  http_req_duration: ["p(95)<1000"],
});

export default function () {
  const params = publicApiHeaders();
  const health = http.get(apiUrl("/public-api/v1/health"), params);
  check(health, {
    "public api health is 200": (r) => r.status === 200,
  });

  const contacts = http.get(apiUrl("/public-api/v1/contacts?limit=10"), params);
  check(contacts, {
    "contacts read is 200": (r) => r.status === 200,
    "contacts response is json": (r) => String(r.headers["Content-Type"] || "").includes("application/json"),
  });

  const conversations = http.get(apiUrl("/public-api/v1/conversations?limit=10"), params);
  check(conversations, {
    "conversations read is 200": (r) => r.status === 200,
  });

  sleepBetweenRequests();
}
