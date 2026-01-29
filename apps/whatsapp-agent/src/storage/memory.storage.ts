import { Storage, StoredMessage } from "./storage.interface.js";

const messages: StoredMessage[] = [];

export const memoryStorage: Storage = {
  saveMessage(message: StoredMessage) {
    messages.push(message);
  },
  listMessages() {
    return [...messages];
  },
};
