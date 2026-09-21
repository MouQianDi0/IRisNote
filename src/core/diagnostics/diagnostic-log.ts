export type DiagnosticValue = string | number | boolean | null;
export type DiagnosticDetails = Readonly<Record<string, DiagnosticValue>>;

type DiagnosticEvent = {
  timestamp: string;
  level: "info" | "warning" | "error";
  scope: string;
  event: string;
  details?: DiagnosticDetails;
};

const MAX_EVENTS = 400;
const MAX_TEXT_LENGTH = 160;
let memoryEvents: string[] = [];
let writeQueue = Promise.resolve();

const isNativeRuntime =
  typeof navigator !== "undefined" && navigator.product === "ReactNative";

async function diagnosticLogFile() {
  const { File, Paths } = await import("expo-file-system");
  return new File(Paths.document, "irisnote-diagnostics.jsonl");
}

function sanitizeText(value: string) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(
      /(bearer|token|authorization|password|cookie)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .slice(0, MAX_TEXT_LENGTH);
}

function sanitizeDetails(details?: DiagnosticDetails) {
  if (!details) return undefined;
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      sanitizeText(key).slice(0, 48),
      typeof value === "string" ? sanitizeText(value) : value,
    ]),
  );
}

async function readPersistentLines() {
  if (!isNativeRuntime) return memoryEvents;
  const logFile = await diagnosticLogFile();
  if (!logFile.exists) return memoryEvents;
  const text = await logFile.text();
  return text.split("\n").filter(Boolean);
}

async function persistLines(lines: string[]) {
  memoryEvents = lines.slice(-MAX_EVENTS);
  if (!isNativeRuntime) return;
  const logFile = await diagnosticLogFile();
  if (!logFile.exists) logFile.create({ intermediates: true });
  logFile.write(`${memoryEvents.join("\n")}\n`);
}

/** Only opaque, allow-listed metadata belongs in this app-owned diagnostic log. */
export function recordDiagnostic(
  scope: string,
  event: string,
  details?: DiagnosticDetails,
  level: DiagnosticEvent["level"] = "info",
) {
  const entry: DiagnosticEvent = {
    timestamp: new Date().toISOString(),
    level,
    scope: sanitizeText(scope),
    event: sanitizeText(event),
    ...(details ? { details: sanitizeDetails(details) } : {}),
  };
  const line = JSON.stringify(entry);
  writeQueue = writeQueue
    .then(async () => {
      const lines = await readPersistentLines();
      await persistLines([...lines, line]);
    })
    .catch(() => {
      console.warn("[Diagnostics] Unable to persist event");
      memoryEvents = [...memoryEvents, line].slice(-MAX_EVENTS);
    });
  return writeQueue;
}

export function diagnosticErrorCategory(cause: unknown) {
  if (cause instanceof Error) return sanitizeText(cause.name || "Error");
  return typeof cause === "string" ? "StringError" : "UnknownError";
}

/** Stable non-reversible label for correlating events without storing account or Todo IDs. */
export function opaqueDiagnosticId(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function createDiagnosticExport(metadata: DiagnosticDetails) {
  await writeQueue;
  const lines = await readPersistentLines();
  const header = JSON.stringify({
    timestamp: new Date().toISOString(),
    type: "irisnote-diagnostic-export",
    metadata: sanitizeDetails(metadata),
  });
  if (!isNativeRuntime) throw new Error("DiagnosticExportUnavailable");
  const { File, Paths } = await import("expo-file-system");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `irisnote-diagnostics-${stamp}.jsonl`;
  const target = new File(Paths.cache, fileName);
  target.create({ overwrite: true, intermediates: true });
  target.write(`${header}\n${lines.join("\n")}${lines.length ? "\n" : ""}`);
  return { uri: target.uri, fileName };
}
