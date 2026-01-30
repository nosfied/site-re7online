import { Intent } from "./intents.js";

export function routeIncomingMessage(text: string): Intent {
  void text;
  return Intent.VENDAS;
}
