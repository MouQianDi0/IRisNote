import { NativeModule, requireOptionalNativeModule } from "expo";

export type NativeExactAlarmAccess = "not-required" | "granted" | "denied";

export type SavedDiagnosticLog = {
  contentUri: string;
  displayPath: string;
};

declare class IrisNoteSystemModule extends NativeModule {
  getExactAlarmAccess(): Promise<NativeExactAlarmAccess>;
  saveDiagnosticLog(
    sourceUri: string,
    fileName: string,
  ): Promise<SavedDiagnosticLog>;
}

export default requireOptionalNativeModule<IrisNoteSystemModule>(
  "IrisNoteSystem",
);
