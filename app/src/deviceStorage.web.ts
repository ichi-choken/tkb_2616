// この端末に文字を残す（ウェブ版）。ブラウザの localStorage に置く。
// プライベートモードや保存の上限で使えないときは、失敗を返して、アプリは止めない
export function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 消せなくても、次に開いたときの読み込みで捨てられるので、何もしない
  }
}
