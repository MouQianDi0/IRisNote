import api from "@/api/client";
import type {
    Category,
    CreateCategoryPayload,
    UpdateCategoryPayload,
} from "@/features/notes/categories/categories.types";

export type {
    Category,
    CreateCategoryPayload,
    UpdateCategoryPayload,
} from "@/features/notes/categories/categories.types";

export async function getCategories(): Promise<Category[]> {
    const { data } = await api.get<Category[]>("/categories");
    return Array.isArray(data) ? data : [];
}

export async function createCategory(
    payload: CreateCategoryPayload,
): Promise<Category> {
    const { data } = await api.post<Category>("/categories", payload);
    return data;
}

export async function updateCategory(
    categoryId: number,
    payload: UpdateCategoryPayload,
): Promise<Category> {
    const { data } = await api.put<Category>(
        `/categories/${categoryId}`,
        payload,
    );
    return data;
}

export async function deleteCategory(
    categoryId: number,
): Promise<{ success: boolean }> {
    const { data } = await api.delete<{ success: boolean }>(
        `/categories/${categoryId}`,
    );
    return data;
}
