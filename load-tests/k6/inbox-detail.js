import http from "k6/http";
import { check } from "k6";
import {
  apiUrl,
  appAuthHeadersForToken,
  config,
  loginAllAppUsers,
  pickToken,
  requireEnv,
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
  const conversationId = requireEnv("CONVERSATION_ID", config.conversationId);
  const params = appAuthHeadersForToken(pickToken(data.tokens));

  const detail = http.get(apiUrl(`/app/conversation/${encodeURIComponent(conversationId)}`), params);
  check(detail, {
    "conversation detail is 200": (r) => r.status === 200,
  });

  const timeline = http.get(apiUrl(`/app/conversation/${encodeURIComponent(conversationId)}/timeline?limit=30`), params);
  check(timeline, {
    "conversation timeline is 200": (r) => r.status === 200,
  });

  sleepBetweenRequests();
}
