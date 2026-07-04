import { NotebookPen } from "lucide-react-native";
import { Pressable } from "react-native";

type AddCategoryButtonProps = {
    onPress: () => void;
};

export default function AddCategoryButton({ onPress }: AddCategoryButtonProps) {
    return (
        <Pressable
            className=" w-[60px] h-[60px] justify-center items-center bg-[rgb(220,220,220)] rounded-[12px] m-[2px] my-[10px] border-[1px] border-[#0000006e]"
            onPress={onPress}
        >
            <NotebookPen size={30} color="#0000006e" />
        </Pressable>
    );
}
