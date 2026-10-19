import type { SyncService } from "@mailconnect/domain";

export type Indexer = {
  nudge(mailboxId: string): void;
  kick(): void;
  stop(): void;
};

export function startIndexer(sync: SyncService, pollMs: number): Indexer {
  let stopped = false;
  let running = false;
  const pending = new Set<string>();

  async function run(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      const ids = [...pending];
      pending.clear();
      for (const id of ids) await sync.syncMailbox(id);
      await sync.syncDue(new Set(ids));
    } catch (error) {
      console.error("Index-Worker", error instanceof Error ? error.message : error);
    } finally {
      running = false;
      if (!stopped && pending.size > 0) void run();
    }
  }

  const timer = setInterval(() => void run(), pollMs);
  const kick = setTimeout(() => void run(), 1_500);
  return {
    nudge(mailboxId: string) {
      pending.add(mailboxId);
      void run();
    },
    kick() {
      void run();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      clearTimeout(kick);
    },
  };
}
