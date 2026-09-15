type CategoriesListener = () => void;

const categoriesListeners: CategoriesListener[] = [];

export const notifyCategoriesChanged = () => {
    categoriesListeners.forEach((listener) => listener());
};

export const onCategoriesChanged = (listener: CategoriesListener) => {
    categoriesListeners.push(listener);
    return () => {
        const index = categoriesListeners.indexOf(listener);
        if (index >= 0) categoriesListeners.splice(index, 1);
    };
};
