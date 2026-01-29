export type StoredMessage = {
  id: string;
  from: string;
  text: string;
  timestamp: number;
};

export interface Storage {
  saveMessage(message: StoredMessage): void;
  listMessages(): StoredMessage[];
}
