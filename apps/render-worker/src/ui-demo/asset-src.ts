import { staticFile } from 'remotion';
import {
  LOCAL_ASSETS,
  resolveAsset,
  type AssetRef,
  type UiAssetKey,
} from './assets.js';

/** `staticFile` lives here so the schema and its tests stay browser-free. */
export function assetSrc(ref: AssetRef): string {
  return staticFile(resolveAsset(ref).file);
}

export function assetSrcByKey(key: UiAssetKey): string {
  return staticFile(LOCAL_ASSETS[key].file);
}
