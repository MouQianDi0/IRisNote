import DeleteConfirmDialog from "../../components/editor/delete-confirm-dialog";

type CategoryDeleteConfirmModalProps = {
    visible: boolean;
    categoryName: string;
    onClose: () => void;
    onConfirm: () => void;
};

export default function CategoryDeleteConfirmModal({
    visible,
    categoryName,
    onClose,
    onConfirm,
}: CategoryDeleteConfirmModalProps) {
    return (
        <DeleteConfirmDialog
            visible={visible}
            description={`分类“${categoryName}”将被删除\n分类内的笔记将移入垃圾桶，15 天内可以恢复。`}
            onClose={onClose}
            onConfirm={async () => onConfirm()}
        />
    );
}
