import { FolderPlus } from "lucide-react-native";
import { Pressable, Text } from "react-native";
import { colors } from "@/shared/theme";

type AddCategoryButtonProps = {
    onPress: () => void;
};

export default function AddCategoryButton({ onPress }: AddCategoryButtonProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="新建分类"
            className="w-[50px] h-[60px] mb-[6px] rounded-control justify-center items-center pl-[6px] pr-[4px] py-[4px]"
            onPress={onPress}
        >
            <FolderPlus size={30} color={colors.primary} />
            <Text numberOfLines={1} className="max-w-[44px] text-[10px]" style={{ color: colors.primary }}>
                新建
            </Text>
        </Pressable>
    );
}
