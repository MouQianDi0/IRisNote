import { router } from "expo-router";
import { useState } from "react";
import { ALL_CATEGORY } from "../categories/categories.constants";
import { getCurrentCategoryId, getCurrentCategoryName } from "../categories/category-selection";
import NoteEditor from "../components/editor/NoteEditor";

export default function CreateNoteScreen() {
    const [category] = useState(() => ({
        id: getCurrentCategoryId(), name: getCurrentCategoryName(),
    }));
    const goBack = () => {
        if (router.canGoBack()) router.back();
        else router.replace("/note");
    };
    return <NoteEditor
        categoryId={category.id === ALL_CATEGORY.id ? null : category.id}
        categoryName={category.name}
        onCancel={goBack}
        onSaved={goBack}
    />;
}
