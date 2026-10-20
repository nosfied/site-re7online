export type ScreenProcessingOperation = {
  id: number;
  title: string;
  message: string;
};

export class ScreenProcessingRegistry {
  private nextId = 0;
  private readonly active = new Map<number, ScreenProcessingOperation>();

  begin(title: string, message: string) {
    const operation = { id: ++this.nextId, title, message };
    this.active.set(operation.id, operation);
    return operation.id;
  }

  end(id: number) {
    return this.active.delete(id);
  }

  clear() {
    this.active.clear();
  }

  current() {
    return Array.from(this.active.values()).at(-1) ?? null;
  }

  get size() {
    return this.active.size;
  }
}
