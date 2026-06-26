import { check } from "k6";
import { login, loginScenarioOptions, sleepBetweenRequests, validateLoginScenarioConfig } from "./lib/config.js";

export const options = loginScenarioOptions();

export function setup() {
  validateLoginScenarioConfig();
}

export default function () {
  const token = login();
  check(token, {
    "login returned token": (value) => typeof value === "string" && value.length > 16,
  });
  sleepBetweenRequests();
}
