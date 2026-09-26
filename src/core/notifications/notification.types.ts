export type BannerId = string;
export type BannerType = "success" | "important" | "special" | "neutral";
export type BannerPriority = "low" | "normal" | "high" | "critical";
export type BannerLifetime =
    | { mode: "timed"; durationMs?: number }
    | { mode: "persistent" }
    | { mode: "until-resolved" };
export type BannerAction = {
    label: string;
    onPress: () => void | Promise<void>;
    dismissOnSuccess?: boolean;
};
export type BannerContent = {
    title: string;
    message?: string;
    type: BannerType;
    priority?: BannerPriority;
    lifetime?: BannerLifetime;
    icon?: "check" | "info" | "warning" | "cloud-off" | "sparkles";
    progress?:
        { mode: "indeterminate" } | { mode: "determinate"; value: number };
    bodyAction?: BannerAction;
    action?: BannerAction;
};
export type BannerOptions = BannerContent & {
    id?: BannerId;
    scope?: "session" | "app";
    queueTtlMs?: number;
};
export type BannerRecord = BannerContent & {
    id: string;
    scope: "session" | "app";
    priority: BannerPriority;
    lifetime: BannerLifetime;
    createdAt: number;
    queueTtlMs: number;
    displayed: boolean;
    remainingMs: number;
    runningSince: number | null;
    version: number;
    instance: number;
    busy: boolean;
};
