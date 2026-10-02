import { colors } from "@/shared/theme";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { useApplicationDatabase } from "@/core/database";
import {
    captureLocalStorageAccess,
    getCloudStorageSnapshot,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import { ChevronDown } from "lucide-react-native";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { loadCategories } from "../../categories/data/category-cache";
import { ALL_CATEGORY } from "../../categories/categories.constants";
import NoteStatisticsPopover from "./note-statistics-popover";

type NoteViewerMetaProps = {
    noteId: number;
    content: string | null;
    categoryId: number | null;
    historyEntry: ReactNode;
    isTitleExpandable: boolean;
    chevronAnimatedStyle: ComponentProps<typeof Animated.View>["style"];
    onToggleTitleExpanded: () => void;
};

export default function NoteViewerMeta({
    noteId,
    content,
    categoryId,
    historyEntry,
    isTitleExpandable,
    chevronAnimatedStyle,
    onToggleTitleExpanded,
}: NoteViewerMetaProps) {
    const {
        enabled: cloudEnabled,
        ownerUserId,
        generation: cloudGeneration,
    } = useCloudStorage();
    const database = useApplicationDatabase();
    const [categoryNameById, setCategoryNameById] = useState<{
        id: number;
        name: string;
    } | null>(null);

    useEffect(() => {
        if (
            categoryId == null ||
            categoryId === ALL_CATEGORY.id ||
            ownerUserId == null
        )
            return;

        let cancelled = false;

        const loadCategoryName = async () => {
            try {
                if (getCloudStorageSnapshot().generation !== cloudGeneration)
                    return;
                const checkAccess = captureLocalStorageAccess(ownerUserId);
                const { categories } = await loadCategories(
                    database,
                    ownerUserId,
                );
                checkAccess();
                const category = categories.find(
                    (item) => item.id === categoryId,
                );
                if (!cancelled) {
                    setCategoryNameById({
                        id: categoryId,
                        name: category?.name ?? "未知分类",
                    });
                }
            } catch (err) {
                if (isCloudStoragePermissionError(err)) return;
                console.error("获取笔记分类名称失败:", err);
                if (!cancelled) {
                    setCategoryNameById({
                        id: categoryId,
                        name: "未知分类",
                    });
                }
            }
        };

        void loadCategoryName();

        return () => {
            cancelled = true;
        };
    }, [categoryId, cloudEnabled, cloudGeneration, database, ownerUserId]);

    const categoryName =
        categoryId != null && categoryNameById?.id === categoryId
            ? categoryNameById.name
            : "加载中";

    return (
        <View className="mt-3 flex-row flex-wrap items-center gap-2">
            <View
                style={{ minWidth: 96 }}
                className="flex-1 flex-row flex-wrap items-center gap-2"
            >
                {categoryId !== ALL_CATEGORY.id && (
                    <View className="rounded-full bg-blue-50 px-3 py-1">
                        <Text className="text-xs text-blue-500">
                            {categoryId == null
                                ? "默认分类"
                                : `分类 ${categoryName}`}
                        </Text>
                    </View>
                )}
                <NoteStatisticsPopover noteId={noteId} content={content} />
            </View>
            {historyEntry}
            {isTitleExpandable && (
                <Pressable
                    onPress={onToggleTitleExpanded}
                    className="h-7 w-7 items-center justify-center"
                >
                    <Animated.View style={chevronAnimatedStyle}>
                        <ChevronDown size={20} color={colors.viewerChevron} />
                    </Animated.View>
                </Pressable>
            )}
        </View>
    );
}
