import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useStore } from '../../app/src/store';
import { importSteamGames } from '../../app/src/steam-profile-import';
import { readSteamLibrary, subscribeSteamLibrary } from './steam-library';
import type { SteamLibrary } from '../../packages/integrations/src/steam';

// Mounted inside StoreProvider only after the saved profile has loaded. It adds no UI.
export function SteamProfileSync() {
  const { s, editProfile, toast } = useStore();
  const editing = !!s.draft || s.saving;
  useEffect(() => {
    if (Platform.OS !== 'web' || editing) return;
    let active = true;
    let request: AbortController | null = null;
    const save = async (library: SteamLibrary) => {
      if (!active || library.status !== 'available') return;
      await editProfile(profile => { if (active) importSteamGames(profile, library); });
    };
    const refresh = () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      void readSteamLibrary(controller.signal).then(library => {
        if (library && !controller.signal.aborted) return save(library);
      }).catch(() => {
        if (active && !controller.signal.aborted) toast('Steamのゲームを取り込めませんでした。設定から再取得できます');
      });
    };
    const unsubscribe = subscribeSteamLibrary(library => {
      request?.abort();
      void save(library);
    });
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; request?.abort(); unsubscribe(); window.removeEventListener('focus', refresh); };
  }, [editing, editProfile, toast]);
  return null;
}
