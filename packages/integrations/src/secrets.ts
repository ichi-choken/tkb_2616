import { IntegrationError } from './http.ts';

function encode(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function decode(value: string): Uint8Array { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export async function tokenCipher(base64Key: string) {
  let bytes: Uint8Array;
  try { bytes = decode(base64Key); } catch { throw new IntegrationError('configuration'); }
  if (bytes.length !== 32) throw new IntegrationError('configuration');
  const key = await crypto.subtle.importKey('raw', bytes as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {
    async seal(value: unknown, context: string): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, key, new TextEncoder().encode(JSON.stringify(value)));
      return `v1.${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
    },
    async open<T>(value: string, context: string): Promise<T> {
      try {
        const [version, iv, body, extra] = value.split('.');
        if (version !== 'v1' || !iv || !body || extra !== undefined) throw new Error('Invalid cipher');
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv) as Uint8Array<ArrayBuffer>, additionalData: new TextEncoder().encode(context) }, key, decode(body) as Uint8Array<ArrayBuffer>);
        return JSON.parse(new TextDecoder().decode(plain)) as T;
      } catch { throw new IntegrationError('relink_required'); }
    },
  };
}
