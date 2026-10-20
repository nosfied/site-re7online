export class CrmContactsCursorHistory {
  private pages = new Map<number, string | null>([[1, null]]);

  reset() {
    this.pages = new Map([[1, null]]);
  }

  cursorFor(page: number) {
    return this.pages.get(page);
  }

  canLoad(page: number) {
    return page === 1 || this.pages.has(page);
  }

  recordNext(loadedPage: number, nextCursor: string | null) {
    if (nextCursor) this.pages.set(loadedPage + 1, nextCursor);
    else this.pages.delete(loadedPage + 1);
    for (const page of Array.from(this.pages.keys())) {
      if (page > loadedPage + 1) this.pages.delete(page);
    }
  }
}
