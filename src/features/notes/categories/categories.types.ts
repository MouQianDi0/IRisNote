export type Category = {
    id: number;
    name: string;
    icon: string;
    is_pinned: boolean;
    is_starred: boolean;
};

export type CreateCategoryPayload = {
    name: string;
    icon?: string;
};

export type UpdateCategoryPayload = Partial<
    Pick<Category, "name" | "icon" | "is_pinned" | "is_starred">
>;
