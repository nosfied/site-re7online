import { Intent } from "./intents.js";

export function routeIncomingMessage(_text: string): Intent {
  return Intent.VENDAS;
}
