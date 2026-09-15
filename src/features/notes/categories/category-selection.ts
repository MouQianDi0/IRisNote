import { ALL_CATEGORY } from "./categories.constants";

let currentCategoryId = ALL_CATEGORY.id;
let currentCategoryName = ALL_CATEGORY.name;

export const setCurrentCategory = (id: number, name: string) => {
    currentCategoryId = id;
    currentCategoryName = name;
};

export const getCurrentCategoryId = () => currentCategoryId;
export const getCurrentCategoryName = () => currentCategoryName;
