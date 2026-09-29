// Only the browser extension APIs this extension uses (instead of the @types/chrome package).
declare namespace chrome {
  namespace storage {
    interface Area {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: Area;
    const session: Area;
    const onChanged: {
      addListener(
        listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
      ): void;
    };
  }
  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
    }
    function get(id: number): Promise<Tab>;
    function query(query: { active: boolean; currentWindow: boolean }): Promise<Tab[]>;
    function update(id: number, props: { url?: string; active?: boolean }): Promise<Tab>;
    function create(props: { url: string; active: boolean }): Promise<Tab>;
    function reload(id: number): Promise<void>;
    const onUpdated: {
      addListener(listener: (id: number, change: { url?: string }, tab: Tab) => void): void;
    };
    const onRemoved: { addListener(listener: (id: number) => void): void };
  }
  namespace action {
    function setBadgeText(details: { text: string }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string }): Promise<void>;
    function setBadgeTextColor(details: { color: string }): Promise<void>;
    function setTitle(details: { title: string }): Promise<void>;
  }
  namespace runtime {
    function sendMessage(message: unknown): Promise<unknown>;
    const onMessage: {
      addListener(
        listener: (message: unknown, sender: unknown, reply: (answer: unknown) => void) => boolean,
      ): void;
    };
  }
}
