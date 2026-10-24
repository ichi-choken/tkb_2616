// 画面デモ用。実際のIGDB検索結果とは区別する。出典確認：2026-10-24。
import type { ImageSourcePropType } from 'react-native';

export const DEMO_COVERS: Record<string, ImageSourcePropType> = {
  // https://cdn.akamai.steamstatic.com/steam/apps/1172470/library_600x900.jpg
  apex: require('../assets/game-covers/apex.jpg'),
  // https://cdn.akamai.steamstatic.com/steam/apps/1097150/library_600x900.jpg
  fallguys: require('../assets/game-covers/fallguys.jpg'),
  // https://www.nintendo.com/jp/switch/av5ja/assets/images/index/pc/product/img_package.png
  splatoon3: require('../assets/game-covers/splatoon3.png'),
};
