import { check } from "k6";
import { login, scenarioOptions, sleepBetweenRequests } from "./lib/config.js";

export const options = scenarioOptions({
  http_req_duration: ["p(95)<1000"],
});

export default function () {
  const token = login();
  check(token, {
    "login returned token": (value) => typeof value === "string" && value.length > 16,
  });
  sleepBetweenRequests();
}
