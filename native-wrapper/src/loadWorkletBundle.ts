/** Load packed Bare worklet via Expo asset pipeline (not fetch/XHR/startFile). */
import { Asset } from "expo-asset";
import { File } from "expo-file-system";

// Packed by scripts/pack-bare.mjs (local prepare / eas-build-post-install).
import workletBundleAsset from "../assets/bare/app.bundle";

export async function loadWorkletBundleBytes(): Promise<Uint8Array> {
  const asset = Asset.fromModule(workletBundleAsset);
  await asset.downloadAsync();
  if (!asset.localUri) {
    throw new Error("Worklet bundle asset has no localUri");
  }
  return new Uint8Array(await new File(asset.localUri).bytes());
}
