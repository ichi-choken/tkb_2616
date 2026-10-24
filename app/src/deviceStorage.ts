// この端末に文字を残す（アプリ版：iOS・Android）。expo-sqlite のキーと値の保存を使う。
// ウェブは deviceStorage.web.ts（localStorage）を使うので、ウェブの書き出しには SQLite は入らない
import Storage from 'expo-sqlite/kv-store';

export function readItem(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): boolean {
  try {
    Storage.setItemSync(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key: string) {
  try {
    Storage.removeItemSync(key);
  } catch {
    // 消せなくても、次に開いたときの読み込みで捨てられるので、何もしない
  }
}
