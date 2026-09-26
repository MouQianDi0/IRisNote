const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("主页面分页使用白色表面，待办页把填充层与圆角边框层分离", () => {
    const navigator = read(
        "src/core/navigation/components/SwipeTabsNavigator.tsx",
    );
    const todos = read("src/features/todos/screens/TodosScreen.tsx");

    assert.match(
        navigator,
        /pageSurface:\s*\{\s*flex: 1,\s*backgroundColor: appColors\.surface,/s,
    );
    assert.match(
        todos,
        /<View className="relative flex-1 rounded-tr-content bg-white">\s*<View\s+className="flex-1 rounded-tr-content border-t border-r border-b border-note-page-border"/s,
    );
    assert.doesNotMatch(todos, /mb-2 h-\[100%\] rounded-tr-content/);
});
