import { NativeModule, requireOptionalNativeModule } from "expo";

export type InstalledApk = { version: string; buildCode: number; sha256: string; deltaSupported: boolean };
export type UpdateStage = "base" | "patch" | "merge" | "target" | "targetMetadata" | "install" | "installMetadata";
export type UpdateProgress = {
  requestId: string;
  stage: UpdateStage;
  processed: number;
  total: number;
  elapsedMs: number;
};
export type VerificationResult = { timingsMs: Partial<Record<UpdateStage, number>> };
export type TargetOptions = {
  requestId: string;
  outputUri: string;
  targetSha256: string;
  targetSize: string;
  targetVersion: string;
  targetBuildCode: string;
  verificationStage: "target" | "install";
};
export type PatchOptions = TargetOptions & { patchUri: string; patchSize: string; baseSha256: string; patchSha256: string };
declare class Updater extends NativeModule<{ onProgress: (event: UpdateProgress) => void }> {
  getInstalledApk(): Promise<InstalledApk>;
  applyPatch(options: PatchOptions): Promise<VerificationResult & { outputUri: string }>;
  verifyApk(options: TargetOptions): Promise<VerificationResult>;
  canInstallPackages(): Promise<boolean>;
}
export default requireOptionalNativeModule<Updater>("IrisNoteUpdater");
