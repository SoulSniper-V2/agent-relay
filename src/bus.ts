export type RelayEvent = {
  type: string;
  at: number;
  [k: string]: unknown;
};

type Sub = (ev: RelayEvent) => void;

export class RelayBus {
  private subs = new Map<string, Set<Sub>>();

  subscribe(userId: string, fn: Sub): () => void {
    let set = this.subs.get(userId);
    if (!set) {
      set = new Set();
      this.subs.set(userId, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) this.subs.delete(userId);
    };
  }

  publish(userIds: string[], ev: RelayEvent) {
    const seen = new Set<string>();
    for (const id of userIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const set = this.subs.get(id);
      if (!set) continue;
      for (const fn of set) {
        try {
          fn(ev);
        } catch {
          /* ignore slow clients */
        }
      }
    }
  }
}
