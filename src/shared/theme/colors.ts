/**
 * Shared color values for native props that cannot consume a NativeWind className,
 * for example icon `color`, SVG `fill` and animated style objects.
 *
 * NativeWind-facing color tokens live in global.css and intentionally mirror
 * these exact values.
 */
export const colors = {
    primary: "#007AFF",
    appBackground: "rgb(242, 242, 242)",
    surface: "#fff",
    surfaceFull: "#ffffff",
    surfaceMuted: "#f5f5f5",
    textPrimary: "#000",
    textSecondary: "#666",
    textMuted: "#999",
    textSubtle: "#ccc",
    transparent: "transparent",

    overlay: "rgba(0,0,0,0.4)",
    overlayStrong: "rgba(0, 0, 0, 0.5)",
    shadow: "rgba(0, 0, 0, 0.13)",

    action: "#213ac5eb",
    floatingAccent: "#36A5FF",
    floatingAccentOpaque: "#37a5ffff",
    floatingSurface: "rgba(255,255,255,0.85)",

    pin: "#2563eb",
    star: "#f59e0b",
    starBadge: "#ffcc00ff",
    warning: "#FF9800",
    warningSurface: "#FFF3E0",
    success: "#4CAF50",
    danger: "#FF3B30",
    dangerBright: "#ff0000ff",

    noteCard: "#e0eaff",
    noteActions: "#e8f1ff",
    notePinAction: "#d9e7ff",
    noteStarAction: "#fff4cc",
    noteDeleteAction: "#ff4d4f",
    noteActionText: "#4b5563",
    viewerChevron: "#6b7280",
    notePageBackground: "#ecedefff",
    notePageBorder: "#d7d7d7",
    scrollTopIcon: "#7c7c7ccb",

    divider: "#d8dee8",
    borderSoft: "#eee",
    categoryButton: "rgb(220,220,220)",
    categoryButtonBorder: "#c4c4c4a1",
    categoryIcon: "#0000006e",
    settingsBackground: "#d697ffff",

    profileGreen: "#34C759",
    profileOrange: "#FF9500",
    profileSilver: "#c0c0c0",
    profilePurple: "#7B61FF",
    profileInactive: "#FF3B30",

    hyperCard: "#F0F0F0",
    hyperList: "#FBFBFB",
    hyperListSelected: "#F8FBFF",
    hyperDivider: "#E0E0E0",
    hyperTextSecondary: "#8C93B0",
    hyperError: "#E94634",
    hyperOutline: "#D9D9D9",
    hyperPrimaryDisabled: "#C2D9FF",
    hyperDangerDisabled: "#F8D7D2",
    hyperSecondaryDisabled: "#F7F7F7",
    hyperLabelDisabled: "#B2B2B2",
    hyperPrimaryFaded: "#80BFFF",
} as const;

export type ThemeColor = keyof typeof colors;
