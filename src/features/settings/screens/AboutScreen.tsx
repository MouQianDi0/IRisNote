import { colors } from "@/shared/theme";
import { AppBrandIcon, Card, Screen } from "@/shared/ui";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { router } from "expo-router";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import {
    compareVersions,
    type ReleaseHistoryItem,
} from "../data/release-history";
import { useReleaseHistory } from "../hooks/use-release-history";

function ReleaseContent({
    release,
    compact,
}: {
    release: ReleaseHistoryItem;
    compact: boolean;
}) {
    const sections = compact
        ? release.sections.slice(0, 1).map((section) => ({
              ...section,
              items: section.items.slice(0, 2),
          }))
        : release.sections;
    return (
        <View className="mt-3">
            {sections.map((section) => (
                <View className="mb-3" key={section.title}>
                    <Text className="text-text-primary mb-1 text-[15px]">
                        {section.title}
                    </Text>
                    {section.items.map((item) => (
                        <View className="mt-1 flex-row" key={item}>
                            <Text className="mr-2 text-sm leading-6 text-primary">
                                •
                            </Text>
                            <Text className="min-w-0 flex-1 text-sm leading-6 text-text-secondary">
                                {item}
                            </Text>
                        </View>
                    ))}
                </View>
            ))}
        </View>
    );
}

export default function AboutScreen() {
    const version =
        Application.nativeApplicationVersion ??
        Constants.expoConfig?.version ??
        "—";
    const buildCode = Application.nativeBuildVersion;
    const { state: historyState, retry: retryHistory } = useReleaseHistory();
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
    const releases = useMemo(() => {
        if (historyState.kind !== "ready") return [];
        const eligible = historyState.releases.filter(
            (release) => compareVersions(release.version, version) <= 0,
        );
        if (eligible.some((release) => release.version === version))
            return eligible;
        // 本机版本尚未出现在服务端历史中（如刚发布的新版本），仍为其保留一个条目。
        return [
            {
                version,
                buildCode: Number(buildCode) || 0,
                publishedOn: "",
                sections: [],
            },
            ...eligible,
        ];
    }, [buildCode, historyState, version]);

    const toggle = (target: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(target)) next.delete(target);
            else next.add(target);
            return next;
        });
    };
    return (
        <Screen className="bg-app-background">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-[560px] self-center px-4">
                    <SettingsPageHeader
                        title="关于 IRisNote"
                        backLabel="返回设置"
                        onBack={() => router.back()}
                    />
                    <View className="items-center pt-2 pb-6">
                        <AppBrandIcon
                            accessibilityLabel="IRisNote 应用图标"
                            size={76}
                            borderRadius={18}
                        />
                        <Text className="text-text-primary mt-3 text-[22px]">
                            IRisNote
                        </Text>
                        <Text className="mt-1 text-sm text-hyper-text-secondary">
                            当前版本 v{version}
                            {buildCode ? `（构建 ${buildCode}）` : ""}
                        </Text>
                    </View>

                    <Text className="mb-3 ml-1 text-[13px] text-hyper-text-secondary">
                        版本记录
                    </Text>
                    {historyState.kind === "loading" ? (
                        <View className="items-center pt-6 pb-10">
                            <ActivityIndicator color={colors.primary} />
                            <Text className="mt-3 text-sm text-text-secondary">
                                正在加载版本记录…
                            </Text>
                        </View>
                    ) : historyState.kind === "error" ? (
                        <View className="items-center pt-6 pb-10">
                            <Text className="text-center text-sm leading-6 text-text-secondary">
                                {historyState.message}
                            </Text>
                            <Pressable
                                accessibilityLabel="重试加载版本记录"
                                accessibilityRole="button"
                                className="mt-4 min-h-12 items-center justify-center rounded-hyper-control bg-primary px-6 active:opacity-[0.85]"
                                onPress={retryHistory}
                            >
                                <Text className="text-base text-white">
                                    重试
                                </Text>
                            </Pressable>
                        </View>
                    ) : (
                        <>
                            {historyState.stale ? (
                                <Text className="mb-2 ml-1 text-[13px] text-hyper-text-secondary">
                                    未能刷新，显示上次内容
                                </Text>
                            ) : null}
                            {releases.map((release, index) => {
                                const current = release.version === version;
                                const isExpanded =
                                    current || expanded.has(release.version);
                                const hasNotes = release.sections.length > 0;
                                return (
                                    <View
                                        className="flex-row"
                                        key={`${release.version}-${release.buildCode}`}
                                    >
                                        <View className="w-7 items-center">
                                            {index < releases.length - 1 ? (
                                                <View
                                                    className="absolute top-3 bottom-0 w-0.5 bg-hyper-divider"
                                                    accessibilityElementsHidden
                                                />
                                            ) : null}
                                            <View
                                                className={
                                                    current
                                                        ? "mt-2 h-3 w-3 rounded-full bg-primary"
                                                        : "mt-2 h-3 w-3 rounded-full border-2 border-hyper-text-secondary bg-app-background"
                                                }
                                            />
                                        </View>
                                        <View className="min-w-0 flex-1 pb-6 pl-3">
                                            <View className="mb-2 flex-row flex-wrap items-center gap-2">
                                                <Text className="text-text-primary text-[17px]">
                                                    v{release.version}
                                                </Text>
                                                {current ? (
                                                    <View className="rounded-full bg-hyper-card-selected px-2 py-1">
                                                        <Text className="text-xs text-primary">
                                                            当前版本
                                                        </Text>
                                                    </View>
                                                ) : null}
                                            </View>
                                            {release.publishedOn ? (
                                                <Text className="mb-3 text-[13px] text-hyper-text-secondary">
                                                    {release.publishedOn}
                                                </Text>
                                            ) : null}
                                            <Card
                                                className="rounded-hyper-card p-4"
                                                style={{
                                                    borderCurve: "continuous",
                                                }}
                                            >
                                                {hasNotes ? (
                                                    <>
                                                        <ReleaseContent
                                                            release={release}
                                                            compact={
                                                                !isExpanded
                                                            }
                                                        />
                                                        {!current ? (
                                                            <Pressable
                                                                accessibilityLabel={`${isExpanded ? "收起" : "展开"} v${release.version} 更新内容`}
                                                                accessibilityRole="button"
                                                                className="mt-1 min-h-11 flex-row items-center justify-center rounded-hyper-control active:bg-surface-muted active:opacity-[0.85]"
                                                                onPress={() =>
                                                                    toggle(
                                                                        release.version,
                                                                    )
                                                                }
                                                            >
                                                                <Text className="mr-1 text-sm text-primary">
                                                                    {isExpanded
                                                                        ? "收起"
                                                                        : "展开全部"}
                                                                </Text>
                                                                {isExpanded ? (
                                                                    <ChevronUp
                                                                        size={
                                                                            16
                                                                        }
                                                                        color={
                                                                            colors.primary
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <ChevronDown
                                                                        size={
                                                                            16
                                                                        }
                                                                        color={
                                                                            colors.primary
                                                                        }
                                                                    />
                                                                )}
                                                            </Pressable>
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <Text className="text-sm leading-6 text-text-secondary">
                                                        该版本暂无更新说明。
                                                    </Text>
                                                )}
                                            </Card>
                                        </View>
                                    </View>
                                );
                            })}
                            <Text className="pb-2 text-center text-[13px] text-hyper-text-secondary">
                                已显示当前版本及全部历史记录
                            </Text>
                        </>
                    )}
                </View>
            </ScrollView>
        </Screen>
    );
}
