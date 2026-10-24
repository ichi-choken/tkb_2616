// Keep an uncertain response's ID only while retrying the same intent. A different
// action, target, user or payload must never receive an earlier action's result.
export function createOperation(newId: () => string) {
  let pending: { key: string; id: string } | null = null;
  let busy = false;
  return {
    isPending: () => busy,
    async run<T>(send: (opId: string) => Promise<T>, key: string): Promise<T | null> {
      if (busy) return null;
      if (pending?.key !== key) pending = { key, id: newId() };
      const attempt = pending;
      busy = true;
      try {
        const result = await send(attempt.id);
        pending = null;
        return result;
      } finally {
        busy = false;
      }
    },
  };
}
