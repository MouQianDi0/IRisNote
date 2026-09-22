import { colors } from "@/shared/theme";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import {
    captureCloudStorageAccess,
    getCloudStorageSnapshot,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import { ChevronDown } from "lucide-react-native";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { getCategories } from "../../categories/api/categories.api";
import { ALL_CATEGORY } from "../../categories/categories.constants";
import NoteStatisticsPopover from "./note-statistics-popover";

type NoteViewerMetaProps = {
    noteId: number;
    content: string | null;
    categoryId: number | null;
    createdAt: string;
    isTitleExpandable: boolean;
    chevronAnimatedStyle: ComponentProps<typeof Animated.View>["style"];
    onToggleTitleExpanded: () => void;
};

const formatCreatedAt = (createdAt: string) => {
    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
        return createdAt;
    }

    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
};

export default function NoteViewerMeta({
    noteId,
    content,
    categoryId,
    createdAt,
    isTitleExpandable,
    chevronAnimatedStyle,
    onToggleTitleExpanded,
}: NoteViewerMetaProps) {
    const {
        enabled: cloudEnabled,
        ownerUserId,
        generation: cloudGeneration,
    } = useCloudStorage();
    const [categoryNameById, setCategoryNameById] = useState<{
        id: number;
        name: string;
    } | null>(null);

    useEffect(() => {
        if (
            categoryId == null ||
            categoryId === ALL_CATEGORY.id ||
            !cloudEnabled ||
            ownerUserId == null
        )
            return;

        let cancelled = false;

        const loadCategoryName = async () => {
            try {
                if (getCloudStorageSnapshot().generation !== cloudGeneration)
                    return;
                const checkAccess = captureCloudStorageAccess(ownerUserId);
                const categories = await getCategories();
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
    }, [categoryId, cloudEnabled, cloudGeneration, ownerUserId]);

    const categoryName =
        categoryId != null && categoryNameById?.id === categoryId
            ? categoryNameById.name
            : cloudEnabled
              ? "加载中"
              : "需开启云存储查看";

    return (
        <View className="mt-3 flex-row items-center gap-2">
            <View className="flex-1 flex-row flex-wrap items-center gap-2">
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
            <Text className="text-xs text-gray-400">
                {formatCreatedAt(createdAt)}
            </Text>
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
