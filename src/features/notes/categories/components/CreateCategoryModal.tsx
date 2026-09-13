import { AppModal } from "@/shared/ui/Overlay/app-modal";
import { InputSave } from "@/shared/ui";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { colors } from "@/shared/theme";
import { DialogButton } from "../../components/editor/draft-dialog";
import CategoryIconPicker from "./CategoryIconPicker";

type CreateCategoryModalProps = {
    visible: boolean;
    onClose: () => void;
    onAdd: (name: string, icon: string) => void;
};

export default function CreateCategoryModal({ visible, onClose, onAdd }: CreateCategoryModalProps) {
    const [name, setName] = useState("");
    const [selectedIcon, setSelectedIcon] = useState("Briefcase");
    const [iconsExpanded, setIconsExpanded] = useState(false);
    const DisclosureIcon = iconsExpanded ? ChevronDown : ChevronRight;

    const handleSubmit = () => {
        const categoryName = name.trim();
        if (!categoryName) return;
        onAdd(categoryName, selectedIcon);
        setName("");
        setSelectedIcon("Briefcase");
        onClose();
    };

    return (
        <AppModal visible={visible} transparent animationType="fade" onRequestClose={onClose}
            onShow={() => setIconsExpanded(false)}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
                <View className="flex-1 items-center justify-center bg-hyper-scrim p-6">
                    <Pressable accessibilityLabel="关闭新建分类" accessibilityRole="button"
                        onPress={onClose} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
                    <View accessibilityViewIsModal className="w-full max-w-[440px] rounded-hyper-modal bg-white p-6"
                        style={{ maxHeight: "85%" }}>
                        <Text accessibilityRole="header" className="text-2xl leading-8 text-black mb-3">新建分类</Text>
                        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                            <Text className="text-sm text-hyper-text-secondary mb-2">分类名称</Text>
                            <InputSave
                                accessibilityLabel="分类名称"
                                containerClassName="w-full"
                                inputClassName="web:outline-none"
                                placeholder="请输入分类名称"
                                value={name} onChangeText={setName} maxLength={10}
                                returnKeyType="done"
                                onSubmitEditing={handleSubmit}
                                onSave={handleSubmit}
                            />
                            <Pressable accessibilityRole="button" accessibilityLabel="选择图标"
                                accessibilityState={{ expanded: iconsExpanded }}
                                onPress={() => setIconsExpanded((expanded) => !expanded)}
                                style={{ marginTop: 16, height: 48, width: "100%", flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Text className="text-sm text-hyper-text-secondary">选择图标</Text>
                                <View accessible={false} pointerEvents="none"
                                    style={{ width: 24, height: 24, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
                                    <DisclosureIcon size={24} color={colors.textSecondary} />
                                </View>
                            </Pressable>
                            {iconsExpanded && <View className="mt-2">
                                <CategoryIconPicker variant="hyper" selectedIcon={selectedIcon} onChange={setSelectedIcon} />
                            </View>}
                        </ScrollView>
                        <View className="flex-row gap-2.5 mt-4">
                            <DialogButton className="flex-1" label="取消" variant="secondary" onPress={onClose} />
                            <DialogButton className="flex-1" label="确定" onPress={handleSubmit} disabled={!name.trim()} />
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </AppModal>
    );
}
