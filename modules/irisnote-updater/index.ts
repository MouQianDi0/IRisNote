import { requireOptionalNativeModule } from "expo";

export type InstalledApk = { version: string; buildCode: number; sha256: string; deltaSupported: boolean };
type Updater = {
  getInstalledApk(): Promise<InstalledApk>;
  applyPatch(options: Record<string, string>): Promise<string>;
  verifyApk(options: Record<string, string>): Promise<void>;
};
export default requireOptionalNativeModule<Updater>("IrisNoteUpdater");
