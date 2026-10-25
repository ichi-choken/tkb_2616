import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Only the loopback server exposes this endpoint. Public builds never request local data.
export function useLocalIntegrations() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return;
    const controller = new AbortController();
    void fetch('/__local/status.json', { signal: controller.signal, cache: 'no-store' })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setAvailable(data?.mode === 'local-integrations'); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return available;
}
