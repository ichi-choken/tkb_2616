// Only the current attempt may commit; leaving the screen cancels pending work.
export function createPendingSave() {
  let generation = 0;
  let pending = false;
  return {
    isPending: () => pending,
    cancel() { generation++; pending = false; },
    async run(wait: () => Promise<void>, commit: (isCurrent: () => boolean) => void | Promise<void>): Promise<boolean> {
      if (pending) return false;
      pending = true;
      const attempt = ++generation;
      try {
        await wait();
        if (attempt !== generation) return false;
        await commit(() => attempt === generation);
        return attempt === generation;
      } catch (error) {
        if (attempt !== generation) return false;
        throw error;
      } finally {
        if (attempt === generation) pending = false;
      }
    },
  };
}
