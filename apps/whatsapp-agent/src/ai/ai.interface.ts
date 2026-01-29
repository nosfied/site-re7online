export interface AIProvider {
  reply(prompt: string): Promise<string>;
}
