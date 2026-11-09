/**
 * Executor dos hooks usados pelo projeto para os testes de orquestração em Node.
 * Não simula DOM: aplica updates, dependências e cleanup de efeitos; JSX é testado à parte.
 */
type Effect = () => void | (() => void);
type Slot = { value?: unknown; deps?: readonly unknown[]; effect?: Effect; cleanup?: () => void };
let active: HookHarness<unknown> | null = null;

function changed(a?: readonly unknown[], b?: readonly unknown[]): boolean {
  return !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
}

export class HookHarness<T> {
  private slots: Slot[] = [];
  private index = 0;
  private effects: Slot[] = [];
  private dirty = true;
  private mounted = true;
  private result!: T;

  constructor(private renderHook: () => T) { this.flush(); }
  get current(): T { this.flush(); return this.result; }

  slot(): Slot {
    const index = this.index++;
    return this.slots[index] ?? (this.slots[index] = {});
  }
  update(): void { if (this.mounted) this.dirty = true; }
  enqueue(slot: Slot): void { this.effects.push(slot); }
  rerender(): void { this.update(); this.flush(); }

  flush(): void {
    let attempts = 0;
    while (this.dirty && this.mounted) {
      if (++attempts > 50) throw new Error("Loop de renderização no hook");
      this.dirty = false;
      this.index = 0;
      active = this as HookHarness<unknown>;
      try { this.result = this.renderHook(); } finally { active = null; }
      for (const slot of this.effects.splice(0)) {
        slot.cleanup?.();
        slot.cleanup = slot.effect?.() || undefined;
      }
    }
  }

  async settle(): Promise<void> {
    for (let i = 0; i < 15; i++) { await Promise.resolve(); this.flush(); }
  }

  replayEffects(): void {
    for (const slot of this.slots) slot.cleanup?.();
    for (const slot of this.slots) if (slot.effect) slot.cleanup = slot.effect() || undefined;
    this.flush();
  }

  unmount(): void {
    this.mounted = false;
    for (const slot of this.slots) slot.cleanup?.();
  }
}

export const hooks = {
  useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
    const host = active!;
    const slot = host.slot();
    if (!("value" in slot)) slot.value = typeof initial === "function" ? (initial as () => T)() : initial;
    return [slot.value as T, (next) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(slot.value as T) : next;
      if (!Object.is(value, slot.value)) { slot.value = value; host.update(); }
    }];
  },
  useRef<T>(initial: T): { current: T } {
    const slot = active!.slot();
    if (!("value" in slot)) slot.value = { current: initial };
    return slot.value as { current: T };
  },
  useEffect(effect: Effect, deps?: readonly unknown[]): void {
    const slot = active!.slot();
    if (changed(slot.deps, deps)) {
      slot.effect = effect;
      slot.deps = deps;
      active!.enqueue(slot);
    }
  },
  useMemo<T>(factory: () => T, deps: readonly unknown[]): T {
    const slot = active!.slot();
    if (changed(slot.deps, deps)) { slot.value = factory(); slot.deps = deps; }
    return slot.value as T;
  },
  useCallback<T>(callback: T, deps: readonly unknown[]): T {
    return hooks.useMemo(() => callback, deps);
  },
};
