import DeleteConfirmDialog from "../../components/editor/delete-confirm-dialog";

type CategoryDeleteConfirmModalProps = {
    visible: boolean;
    categoryName: string;
    onClose: () => void;
    onConfirm: () => void;
};

export default function CategoryDeleteConfirmModal({
    visible, categoryName, onClose, onConfirm,
}: CategoryDeleteConfirmModalProps) {
    return <DeleteConfirmDialog
        visible={visible}
        description={`删除后无法找回\n分类“${categoryName}”下的笔记将被永久删除`}
        onClose={onClose}
        onConfirm={async () => onConfirm()}
    />;
}
