import { readItem, writeItem } from './deviceStorage';
import { createDemoSettings } from './demo-settings-state';

// 設定画面とプロフィールは、端末から復元した同じ状態を参照する。
export const demoSettings = createDemoSettings({ readItem, writeItem });
