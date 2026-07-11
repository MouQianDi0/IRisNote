import { NotebookPen } from "lucide-react-native";
import { Pressable } from "react-native";
import { colors } from "@/shared/theme";

type AddCategoryButtonProps = {
    onPress: () => void;
};

export default function AddCategoryButton({ onPress }: AddCategoryButtonProps) {
    return (
        <Pressable
            className="w-[60px] h-[60px] justify-center items-center bg-category-button rounded-control m-[2px] my-[10px] border-[1px] border-category-button-border"
            onPress={onPress}
        >
            <NotebookPen size={30} color={colors.categoryIcon} />
        </Pressable>
    );
}
