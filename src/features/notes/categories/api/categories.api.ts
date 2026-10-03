import api from "@/shared/http/client";
import type { AxiosRequestConfig } from "axios";
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

export async function getCategories(
    config?: AxiosRequestConfig,
): Promise<Category[]> {
    const { data } = await api.get<Category[]>("/categories", config);
    if (config?.loginRestoreId !== undefined && !Array.isArray(data))
        throw new Error("分类数据无效，本机内容已保留");
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
