# Zustand 入门学习文档

> 适合人群：刚开始学习 React、TypeScript 和状态管理的初学者  
> 学习目标：能够在 React + TypeScript 项目中独立创建、使用和维护 Zustand Store  
> 实践项目：IRisNote 笔记应用  
> 建议周期：14 天，每天 45～90 分钟

---

## 目录

- [1. 学习目标](#1-学习目标)
- [2. 学习前需要掌握什么](#2-学习前需要掌握什么)
- [3. 什么是状态管理](#3-什么是状态管理)
- [4. Zustand 是什么](#4-zustand-是什么)
- [5. 环境准备](#5-环境准备)
- [6. Zustand 的五个核心概念](#6-zustand-的五个核心概念)
- [7. 第一个 Zustand Store](#7-第一个-zustand-store)
- [8. 14 天学习路线](#8-14-天学习路线)
- [9. 把悬浮菜单代码迁移到 Zustand](#9-把悬浮菜单代码迁移到-zustand)
- [10. 笔记应用综合练习](#10-笔记应用综合练习)
- [11. 常见错误与排查方式](#11-常见错误与排查方式)
- [12. 学习完成检查表](#12-学习完成检查表)
- [13. 术语表](#13-术语表)
- [14. 后续学习方向](#14-后续学习方向)
- [15. 官方资料](#15-官方资料)

---

# 1. 学习目标

完成这份文档后，你应该能够：

- 理解什么是状态、Store、Action 和 Selector。
- 使用 Zustand 创建全局状态仓库。
- 在 React 组件中读取状态。
- 使用 Action 修改状态。
- 使用 TypeScript 为 Store 添加类型。
- 正确更新对象和数组。
- 使用 `getState()` 在组件外读取状态。
- 使用 `subscribe()` 监听状态变化。
- 使用 `persist` 保存主题、设置等数据。
- 把 IRisNote 中手写的状态管理代码迁移到 Zustand。
- 判断一个状态应该放在 `useState`、Zustand，还是服务端请求库中。

---

# 2. 学习前需要掌握什么

不需要成为 React 高手，但建议先了解下面的基础知识。

## 2.1 JavaScript 基础

需要认识：

```ts
const name = "IRisNote";
let count = 0;

const user = {
  name: "Timmmi",
  age: 18,
};

const notes = ["第一篇笔记", "第二篇笔记"];
```

需要知道：

- 变量：`const`、`let`
- 对象：`{}`
- 数组：`[]`
- 函数
- 箭头函数
- `map`
- `filter`
- 展开运算符 `...`

## 2.2 TypeScript 基础

需要认识：

```ts
const title: string = "我的笔记";
const count: number = 1;
const hidden: boolean = false;
```

以及简单类型：

```ts
type Note = {
  id: string;
  title: string;
  content: string;
};
```

## 2.3 React 基础

建议先理解：

```tsx
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
```

至少知道：

- 什么是组件
- 什么是 Props
- 什么是 `useState`
- 什么是事件，例如 `onClick`
- 状态变化后，组件会重新渲染

---

# 3. 什么是状态管理

## 3.1 什么是状态

状态就是程序当前需要记住的数据。

例如笔记应用可能需要记住：

```ts
const sidebarOpen = true;
const currentNoteId = "note-001";
const theme = "dark";
const searchKeyword = "React";
```

这些都属于状态。

## 3.2 组件内部状态

一个状态只被一个组件使用时，可以优先使用 `useState`：

```tsx
const [inputValue, setInputValue] = useState("");
```

例如：

- 输入框当前内容
- 当前按钮是否被按下
- 一个只在当前组件中使用的小弹窗

## 3.3 全局共享状态

多个组件都要使用同一份状态时，状态管理会变得麻烦。

例如：

```text
顶部工具栏需要知道当前主题
设置页面需要修改当前主题
编辑器需要使用当前主题
侧边栏也需要使用当前主题
```

如果不停地通过 Props 一层层传递，代码可能变成：

```text
App
└── Layout
    └── Main
        └── Editor
            └── Toolbar
```

这时可以使用 Zustand 保存共享状态。

---

# 4. Zustand 是什么

Zustand 是一个轻量的 React 状态管理库。

它可以帮助我们：

1. 创建一个 Store。
2. 在 Store 中保存状态。
3. 定义修改状态的函数。
4. 让组件订阅自己需要的状态。
5. 状态变化时自动更新相关组件。

一个 Store 可以想象成公共储物柜：

```text
┌─────────────────────────┐
│ Zustand Store           │
├─────────────────────────┤
│ theme                   │
│ sidebarOpen             │
│ currentNoteId           │
│ notes                   │
├─────────────────────────┤
│ setTheme()              │
│ toggleSidebar()         │
│ selectNote()            │
│ addNote()               │
└─────────────────────────┘
```

多个组件都可以从这个储物柜读取数据或调用操作函数。

---

# 5. 环境准备

## 5.1 安装 Zustand

进入项目根目录，在终端运行：

```bash
npm install zustand
```

使用 pnpm：

```bash
pnpm add zustand
```

使用 yarn：

```bash
yarn add zustand
```

## 5.2 推荐目录结构

```text
src/
├── components/
├── pages/
├── stores/
│   ├── counterStore.ts
│   ├── floatingMenuStore.ts
│   ├── notesStore.ts
│   └── settingsStore.ts
├── types/
└── App.tsx
```

小项目可以使用：

```text
src/stores/
```

统一保存所有 Store。

---

# 6. Zustand 的五个核心概念

# 6.1 Store

Store 是状态仓库。

```ts
type CounterStore = {
  count: number;
  increase: () => void;
};
```

这个 Store 中有：

- 状态：`count`
- 操作：`increase`

---

## 6.2 State

State 是 Store 中保存的数据。

```ts
count: 0
```

例如：

```ts
type AppState = {
  sidebarOpen: boolean;
  currentNoteId: string | null;
  theme: "light" | "dark";
};
```

---

## 6.3 Action

Action 是用于修改状态的函数。

```ts
increase: () => {
  set((state) => ({
    count: state.count + 1,
  }));
}
```

推荐通过 Action 修改状态，而不是让每个组件自己随意修改。

---

## 6.4 Selector

Selector 用于选择组件需要的状态。

```tsx
const count = useCounterStore((state) => state.count);
```

这里的：

```ts
(state) => state.count
```

就是 Selector。

它的意思是：

> 我只需要 Store 中的 `count`。

状态仓库中其他数据改变时，如果当前组件没有选择那些数据，就不一定需要重新渲染。

---

## 6.5 Subscribe

Subscribe 表示订阅状态变化。

```ts
const unsubscribe = useCounterStore.subscribe((state) => {
  console.log(state.count);
});
```

取消订阅：

```ts
unsubscribe();
```

它适用于：

- 调试
- 日志
- 非 React 代码
- 需要监听状态变化的特殊场景

React 组件中通常优先使用 Selector，不需要手动订阅。

---

# 7. 第一个 Zustand Store

## 7.1 创建 Store 文件

创建：

```text
src/stores/counterStore.ts
```

代码：

```ts
import { create } from "zustand";

type CounterStore = {
  count: number;
  increase: () => void;
  decrease: () => void;
  reset: () => void;
};

export const useCounterStore = create<CounterStore>()((set) => ({
  count: 0,

  increase: () => {
    set((state) => ({
      count: state.count + 1,
    }));
  },

  decrease: () => {
    set((state) => ({
      count: state.count - 1,
    }));
  },

  reset: () => {
    set({
      count: 0,
    });
  },
}));
```

## 7.2 逐行理解

### 导入 `create`

```ts
import { create } from "zustand";
```

`create` 用于创建 Store。

### 定义类型

```ts
type CounterStore = {
  count: number;
  increase: () => void;
  decrease: () => void;
  reset: () => void;
};
```

这里定义了 Store 的结构。

### 创建 Store

```ts
export const useCounterStore = create<CounterStore>()((set) => ({
```

可以分成三部分：

```text
create<CounterStore>()
```

创建一个符合 `CounterStore` 类型的 Store。

```text
(set) => ...
```

Zustand 把 `set` 交给我们，`set` 用于修改状态。

```text
export const useCounterStore
```

导出 Store，让其他文件可以使用。

### 初始状态

```ts
count: 0,
```

计数器初始值为 `0`。

### 不依赖旧状态时

```ts
reset: () => {
  set({
    count: 0,
  });
},
```

直接传入对象。

### 依赖旧状态时

```ts
increase: () => {
  set((state) => ({
    count: state.count + 1,
  }));
},
```

因为新值依赖旧的 `count`，所以使用函数写法。

---

## 7.3 在 React 中使用

```tsx
import { useCounterStore } from "./stores/counterStore";

export function Counter() {
  const count = useCounterStore((state) => state.count);
  const increase = useCounterStore((state) => state.increase);
  const decrease = useCounterStore((state) => state.decrease);
  const reset = useCounterStore((state) => state.reset);

  return (
    <section>
      <h2>计数器</h2>
      <p>当前数字：{count}</p>

      <button onClick={increase}>加一</button>
      <button onClick={decrease}>减一</button>
      <button onClick={reset}>重置</button>
    </section>
  );
}
```

## 7.4 第一个练习

请独立增加：

```ts
increaseBy: (amount: number) => void;
```

参考答案：

```ts
increaseBy: (amount) => {
  set((state) => ({
    count: state.count + amount,
  }));
},
```

---

# 8. 14 天学习路线

---

## 第 1 天：复习 React 状态

### 学习内容

- `useState`
- 状态变化与重新渲染
- 事件处理

### 练习

制作一个计数器：

```tsx
const [count, setCount] = useState(0);
```

### 过关标准

- [ ] 能解释什么是状态
- [ ] 能使用 `useState`
- [ ] 能点击按钮修改状态

---

## 第 2 天：创建第一个 Zustand Store

### 学习内容

- `create`
- State
- Action
- `set`

### 练习

完成：

- 加一
- 减一
- 重置
- 加指定数字

### 过关标准

- [ ] 能创建 Store
- [ ] 能定义 Store 类型
- [ ] 能通过 Action 修改状态

---

## 第 3 天：学习 Selector

### 学习内容

```tsx
const count = useCounterStore((state) => state.count);
```

### 对比

不推荐初学时到处读取整个 Store：

```tsx
const store = useCounterStore();
```

推荐只选择需要的部分：

```tsx
const count = useCounterStore((state) => state.count);
```

### 练习

创建两个组件：

```text
CountDisplay：只显示 count
CountButtons：只读取操作函数
```

### 过关标准

- [ ] 能解释 Selector
- [ ] 能让不同组件读取同一个 Store
- [ ] 能只读取当前组件需要的状态

---

## 第 4 天：TypeScript 类型

### 学习内容

```ts
type UIStore = {
  sidebarOpen: boolean;
  theme: "light" | "dark";
  currentNoteId: string | null;
  toggleSidebar: () => void;
  setTheme: (theme: "light" | "dark") => void;
};
```

### 重点

```ts
string | null
```

表示值可以是字符串，也可以为空。

```ts
(theme: "light" | "dark") => void
```

表示参数只能是 `"light"` 或 `"dark"`。

### 练习

创建 `uiStore.ts`，保存：

- 侧边栏状态
- 当前主题
- 当前选择的笔记 ID

### 过关标准

- [ ] 能区分数据和函数
- [ ] 能写布尔值、字符串、联合类型
- [ ] 能为 Action 编写参数类型

---

## 第 5 天：布尔状态与切换

### 学习内容

```ts
toggleSidebar: () => {
  set((state) => ({
    sidebarOpen: !state.sidebarOpen,
  }));
},
```

`!` 表示取反：

```text
true  → false
false → true
```

### 练习

实现：

- `openSidebar`
- `closeSidebar`
- `toggleSidebar`
- `showFloatingMenu`
- `hideFloatingMenu`

### 过关标准

- [ ] 能实现显示、隐藏和切换
- [ ] 知道什么时候使用对象写法
- [ ] 知道什么时候使用函数写法

---

## 第 6 天：更新对象

### 初始类型

```ts
type UserSettings = {
  fontSize: number;
  lineHeight: number;
  spellCheck: boolean;
};
```

### Store

```ts
type SettingsStore = {
  settings: UserSettings;
  setFontSize: (fontSize: number) => void;
};
```

### 更新对象

```ts
setFontSize: (fontSize) => {
  set((state) => ({
    settings: {
      ...state.settings,
      fontSize,
    },
  }));
},
```

### 为什么使用 `...state.settings`

因为我们只想修改 `fontSize`，保留其他字段。

错误示例：

```ts
settings: {
  fontSize,
}
```

这样可能把 `lineHeight` 和 `spellCheck` 丢掉。

### 过关标准

- [ ] 能用展开运算符更新对象
- [ ] 不会意外覆盖对象中的其他属性

---

## 第 7 天：更新数组

### Note 类型

```ts
type Note = {
  id: string;
  title: string;
  content: string;
};
```

### 添加

```ts
addNote: (note) => {
  set((state) => ({
    notes: [...state.notes, note],
  }));
},
```

### 删除

```ts
deleteNote: (id) => {
  set((state) => ({
    notes: state.notes.filter((note) => note.id !== id),
  }));
},
```

### 修改

```ts
updateNoteTitle: (id, title) => {
  set((state) => ({
    notes: state.notes.map((note) =>
      note.id === id
        ? { ...note, title }
        : note,
    ),
  }));
},
```

### 练习

实现：

- 添加笔记
- 删除笔记
- 修改标题
- 修改正文
- 将笔记标记为收藏

### 过关标准

- [ ] 会使用 `...`
- [ ] 会使用 `filter`
- [ ] 会使用 `map`
- [ ] 不直接修改原数组

---

## 第 8 天：在组件外使用 Store

### 读取状态

```ts
const hidden = useFloatingMenuStore.getState().hidden;
```

### 调用 Action

```ts
useFloatingMenuStore.getState().hide();
```

### 注意

在 React 组件中：

```tsx
const hidden = useFloatingMenuStore((state) => state.hidden);
```

这是响应式的，状态变化后组件会更新。

在组件外：

```ts
useFloatingMenuStore.getState().hidden;
```

只是读取当前这一刻的值，不会让 React 组件自动订阅。

### 过关标准

- [ ] 能区分 Selector 和 `getState()`
- [ ] 能在普通 `.ts` 文件中调用 Action

---

## 第 9 天：订阅状态变化

```ts
const unsubscribe = useFloatingMenuStore.subscribe(
  (state, previousState) => {
    if (state.hidden !== previousState.hidden) {
      console.log(
        "悬浮菜单状态变化：",
        previousState.hidden,
        "→",
        state.hidden,
      );
    }
  },
);
```

取消订阅：

```ts
unsubscribe();
```

### 使用场景

- 写调试日志
- 与非 React 代码连接
- 状态变化后执行额外操作
- 监听全局事件

### 注意

React 组件中不要为了普通显示需求滥用 `subscribe()`。

优先使用：

```tsx
useFloatingMenuStore((state) => state.hidden);
```

### 过关标准

- [ ] 会订阅
- [ ] 会取消订阅
- [ ] 知道普通组件优先使用 Selector

---

## 第 10 天：状态重置

```ts
type EditorStore = {
  title: string;
  content: string;
  resetEditor: () => void;
};

const initialState = {
  title: "",
  content: "",
};

export const useEditorStore = create<EditorStore>()((set) => ({
  ...initialState,

  resetEditor: () => {
    set(initialState);
  },
}));
```

### 练习

在退出编辑页面时清空：

- 标题
- 正文
- 是否正在保存
- 错误信息

### 过关标准

- [ ] 能提取初始状态
- [ ] 能实现重置功能

---

## 第 11 天：使用 persist 持久化

普通 Store 刷新页面后会恢复初始值。

使用 `persist` 可以将部分状态保存到浏览器存储中。

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type SettingsStore = {
  theme: "light" | "dark";
  fontSize: number;
  setTheme: (theme: "light" | "dark") => void;
  setFontSize: (fontSize: number) => void;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "light",
      fontSize: 16,

      setTheme: (theme) => {
        set({ theme });
      },

      setFontSize: (fontSize) => {
        set({ fontSize });
      },
    }),
    {
      name: "iris-note-settings",
    },
  ),
);
```

### 适合持久化

- 主题
- 字体大小
- 布局设置
- 最近打开的笔记 ID
- 用户偏好

### 不适合持久化

- 鼠标位置
- 临时弹窗
- 加载状态
- 临时错误信息
- 每次刷新都应该重新获取的数据

### 过关标准

- [ ] 能添加 `persist`
- [ ] 刷新后设置仍然存在
- [ ] 知道哪些状态适合保存

---

## 第 12 天：拆分 Store

不要把所有内容都塞进一个巨大 Store。

推荐按职责拆分：

```text
stores/
├── uiStore.ts
├── notesStore.ts
├── editorStore.ts
├── settingsStore.ts
└── authStore.ts
```

### 示例职责

`uiStore.ts`

```text
侧边栏、菜单、弹窗
```

`notesStore.ts`

```text
笔记列表、增删改
```

`editorStore.ts`

```text
当前编辑内容、保存状态
```

`settingsStore.ts`

```text
主题、字号、用户偏好
```

### 拆分原则

一个 Store 尽量只负责一个领域。

不要因为“都是状态”就全部放在一起。

### 过关标准

- [ ] 能按业务职责拆分
- [ ] 不创建一个包含所有状态的超级 Store

---

## 第 13 天：迁移 IRisNote 状态

选择项目中的一个手写状态文件进行迁移。

建议顺序：

1. 悬浮菜单状态
2. 侧边栏状态
3. 主题状态
4. 当前笔记 ID
5. 笔记列表

迁移时遵循：

```text
先添加新 Store
→ 替换读取代码
→ 替换修改代码
→ 测试
→ 删除旧文件
```

不要一开始就删除旧代码。

### 过关标准

- [ ] 迁移后功能正常
- [ ] 不再手动维护 Listener 数组
- [ ] 组件能够自动更新

---

## 第 14 天：综合项目与复习

完成一个简单笔记应用：

- 显示笔记列表
- 新增笔记
- 删除笔记
- 修改标题
- 选择当前笔记
- 切换主题
- 控制悬浮菜单
- 刷新后保留主题

### 最终检查

- [ ] 至少创建 3 个 Store
- [ ] 使用 TypeScript
- [ ] 使用 Selector
- [ ] 更新过对象和数组
- [ ] 使用过 `getState()`
- [ ] 使用过 `subscribe()`
- [ ] 使用过 `persist`
- [ ] 能解释每段核心代码

---

# 9. 把悬浮菜单代码迁移到 Zustand

你原来的手写代码大致负责四件事：

```text
保存 hidden
读取 hidden
修改 hidden
通知所有 Listener
```

Zustand 可以帮助你管理这些工作。

## 9.1 创建 Store

创建：

```text
src/stores/floatingMenuStore.ts
```

```ts
import { create } from "zustand";

type FloatingMenuStore = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

export const useFloatingMenuStore =
  create<FloatingMenuStore>()((set) => ({
    hidden: false,

    setHidden: (hidden) => {
      set({ hidden });
    },

    show: () => {
      set({ hidden: false });
    },

    hide: () => {
      set({ hidden: true });
    },

    toggle: () => {
      set((state) => ({
        hidden: !state.hidden,
      }));
    },
  }));
```

## 9.2 在菜单组件中读取

```tsx
import { useFloatingMenuStore } from "../stores/floatingMenuStore";

export function FloatingMenu() {
  const hidden = useFloatingMenuStore((state) => state.hidden);

  if (hidden) {
    return null;
  }

  return (
    <div className="floating-menu">
      <button>新建笔记</button>
      <button>删除笔记</button>
    </div>
  );
}
```

## 9.3 在控制组件中修改

```tsx
import { useFloatingMenuStore } from "../stores/floatingMenuStore";

export function FloatingMenuControls() {
  const show = useFloatingMenuStore((state) => state.show);
  const hide = useFloatingMenuStore((state) => state.hide);
  const toggle = useFloatingMenuStore((state) => state.toggle);

  return (
    <div>
      <button onClick={show}>显示菜单</button>
      <button onClick={hide}>隐藏菜单</button>
      <button onClick={toggle}>切换菜单</button>
    </div>
  );
}
```

## 9.4 在普通 TypeScript 文件中修改

```ts
import { useFloatingMenuStore } from "../stores/floatingMenuStore";

export function enterFocusMode() {
  useFloatingMenuStore.getState().hide();
}

export function leaveFocusMode() {
  useFloatingMenuStore.getState().show();
}
```

## 9.5 新旧写法对应

| 原来的写法 | Zustand 写法 |
|---|---|
| `floatingMenuHidden` | `hidden` |
| `getFloatingMenuHidden()` | Selector 或 `getState().hidden` |
| `setFloatingMenuHidden(true)` | `getState().setHidden(true)` |
| `listeners.push(fn)` | `subscribe(fn)` |
| `forEach` 通知 | Zustand 内部完成 |
| 手动删除 Listener | 调用 `subscribe` 返回的函数 |

## 9.6 迁移注意事项

不要把：

```ts
useFloatingMenuStore(...)
```

写在普通函数、事件文件或条件语句里。

Hook 形式主要在 React 组件或自定义 Hook 中使用。

普通 TypeScript 文件使用：

```ts
useFloatingMenuStore.getState()
```

---

# 10. 笔记应用综合练习

## 10.1 定义笔记类型

创建：

```text
src/types/note.ts
```

```ts
export type Note = {
  id: string;
  title: string;
  content: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
};
```

## 10.2 创建 Notes Store

```ts
import { create } from "zustand";
import type { Note } from "../types/note";

type NotesStore = {
  notes: Note[];
  currentNoteId: string | null;

  addNote: () => void;
  deleteNote: (id: string) => void;
  selectNote: (id: string) => void;
  clearSelection: () => void;
  updateNoteTitle: (id: string, title: string) => void;
  updateNoteContent: (id: string, content: string) => void;
  toggleFavorite: (id: string) => void;
};

export const useNotesStore = create<NotesStore>()((set) => ({
  notes: [],
  currentNoteId: null,

  addNote: () => {
    const now = Date.now();

    const newNote: Note = {
      id: crypto.randomUUID(),
      title: "未命名笔记",
      content: "",
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({
      notes: [...state.notes, newNote],
      currentNoteId: newNote.id,
    }));
  },

  deleteNote: (id) => {
    set((state) => ({
      notes: state.notes.filter((note) => note.id !== id),
      currentNoteId:
        state.currentNoteId === id
          ? null
          : state.currentNoteId,
    }));
  },

  selectNote: (id) => {
    set({
      currentNoteId: id,
    });
  },

  clearSelection: () => {
    set({
      currentNoteId: null,
    });
  },

  updateNoteTitle: (id, title) => {
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id
          ? {
              ...note,
              title,
              updatedAt: Date.now(),
            }
          : note,
      ),
    }));
  },

  updateNoteContent: (id, content) => {
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id
          ? {
              ...note,
              content,
              updatedAt: Date.now(),
            }
          : note,
      ),
    }));
  },

  toggleFavorite: (id) => {
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id
          ? {
              ...note,
              favorite: !note.favorite,
              updatedAt: Date.now(),
            }
          : note,
      ),
    }));
  },
}));
```

## 10.3 显示笔记列表

```tsx
import { useNotesStore } from "../stores/notesStore";

export function NotesList() {
  const notes = useNotesStore((state) => state.notes);
  const currentNoteId = useNotesStore(
    (state) => state.currentNoteId,
  );
  const selectNote = useNotesStore((state) => state.selectNote);
  const deleteNote = useNotesStore((state) => state.deleteNote);

  return (
    <ul>
      {notes.map((note) => (
        <li key={note.id}>
          <button onClick={() => selectNote(note.id)}>
            {note.id === currentNoteId ? "● " : ""}
            {note.title}
          </button>

          <button onClick={() => deleteNote(note.id)}>
            删除
          </button>
        </li>
      ))}
    </ul>
  );
}
```

## 10.4 当前笔记

```tsx
import { useNotesStore } from "../stores/notesStore";

export function NoteEditor() {
  const notes = useNotesStore((state) => state.notes);
  const currentNoteId = useNotesStore(
    (state) => state.currentNoteId,
  );
  const updateNoteTitle = useNotesStore(
    (state) => state.updateNoteTitle,
  );
  const updateNoteContent = useNotesStore(
    (state) => state.updateNoteContent,
  );

  const currentNote = notes.find(
    (note) => note.id === currentNoteId,
  );

  if (!currentNote) {
    return <p>请选择一篇笔记</p>;
  }

  return (
    <section>
      <input
        value={currentNote.title}
        onChange={(event) =>
          updateNoteTitle(
            currentNote.id,
            event.target.value,
          )
        }
      />

      <textarea
        value={currentNote.content}
        onChange={(event) =>
          updateNoteContent(
            currentNote.id,
            event.target.value,
          )
        }
      />
    </section>
  );
}
```

## 10.5 思考题

1. 为什么删除当前笔记时，要把 `currentNoteId` 设置为 `null`？
2. 为什么修改数组时使用 `map`？
3. 为什么删除数组项目时使用 `filter`？
4. 为什么 `updatedAt` 每次修改都要更新？
5. 哪些状态应该持久化？
6. 笔记数据未来应该保存在 Zustand、数据库还是文件中？

---

# 11. 常见错误与排查方式

## 11.1 忘记安装 Zustand

错误可能类似：

```text
Cannot find module 'zustand'
```

解决：

```bash
npm install zustand
```

然后重新启动开发服务器。

---

## 11.2 导入路径错误

错误：

```ts
import { useCounterStore } from "./store/counterStore";
```

但真实目录是：

```text
src/stores/counterStore.ts
```

检查：

- `store` 还是 `stores`
- 相对路径层级
- 文件名大小写
- 是否正确导出

---

## 11.3 忘记导出 Store

错误：

```ts
const useCounterStore = create(...);
```

其他文件无法导入。

应该写：

```ts
export const useCounterStore = create(...);
```

---

## 11.4 直接修改数组

不推荐：

```ts
state.notes.push(newNote);
```

初学时推荐：

```ts
set((state) => ({
  notes: [...state.notes, newNote],
}));
```

---

## 11.5 直接修改对象

不推荐：

```ts
state.settings.fontSize = 18;
```

推荐：

```ts
set((state) => ({
  settings: {
    ...state.settings,
    fontSize: 18,
  },
}));
```

---

## 11.6 在普通函数中使用 Hook 方式

错误：

```ts
function normalFunction() {
  const hidden = useFloatingMenuStore(
    (state) => state.hidden,
  );
}
```

普通非 React 函数中使用：

```ts
function normalFunction() {
  const hidden =
    useFloatingMenuStore.getState().hidden;
}
```

---

## 11.7 在条件语句中调用 Store Hook

错误：

```tsx
if (enabled) {
  const hidden = useFloatingMenuStore(
    (state) => state.hidden,
  );
}
```

Hook 应该在组件顶层调用：

```tsx
const hidden = useFloatingMenuStore(
  (state) => state.hidden,
);

if (!enabled) {
  return null;
}
```

---

## 11.8 Store 过大

问题：

```text
一个 Store 中放了 UI、笔记、用户、网络、主题、编辑器等所有状态
```

解决：

按职责拆分多个 Store。

---

## 11.9 把所有服务端数据都塞进 Zustand

Zustand 很适合客户端状态，但服务端请求数据通常还涉及：

- 缓存
- 重新请求
- 请求失败
- 过期时间
- 分页
- 重试

后期可以学习 TanStack Query 来处理服务端状态。

---

## 11.10 persist 保存了旧数据结构

修改 Store 类型后，本地存储中可能仍有旧数据。

排查时可以：

1. 打开浏览器开发者工具。
2. 找到 Application。
3. 找到 Local Storage。
4. 删除对应的 Store 数据。
5. 刷新页面。

开发阶段可以为持久化数据增加版本和迁移逻辑，但入门阶段先理解基本原理。

---

# 12. 学习完成检查表

## 基础

- [ ] 我知道 State 是什么
- [ ] 我知道 Store 是什么
- [ ] 我知道 Action 是什么
- [ ] 我知道 Selector 是什么
- [ ] 我会安装 Zustand
- [ ] 我会创建 Store

## React 使用

- [ ] 我会在组件中读取状态
- [ ] 我会在组件中调用 Action
- [ ] 我会在多个组件中共享状态
- [ ] 我知道只选择需要的状态

## TypeScript

- [ ] 我会定义 Store 类型
- [ ] 我会定义函数参数类型
- [ ] 我理解 `string | null`
- [ ] 我理解 `() => void`

## 状态更新

- [ ] 我会修改普通值
- [ ] 我会切换布尔值
- [ ] 我会更新对象
- [ ] 我会添加数组项目
- [ ] 我会删除数组项目
- [ ] 我会修改数组项目

## 进阶基础

- [ ] 我会使用 `getState()`
- [ ] 我会使用 `subscribe()`
- [ ] 我会取消订阅
- [ ] 我会使用 `persist`
- [ ] 我会拆分多个 Store
- [ ] 我能把旧状态代码迁移到 Zustand

---

# 13. 术语表

| 术语 | 中文理解 |
|---|---|
| State | 程序当前记住的数据 |
| Store | 保存状态和操作函数的仓库 |
| Action | 修改状态的函数 |
| Selector | 从 Store 中选择需要的数据 |
| Subscribe | 监听状态变化 |
| Unsubscribe | 取消监听 |
| Persist | 把状态保存到本地存储 |
| Middleware | 在 Store 外包一层额外能力 |
| Immutable | 不直接修改原数据，而是创建新数据 |
| Render | React 根据状态生成界面 |
| Re-render | 状态变化后重新生成界面 |
| Hook | React 中以 `use` 开头的一类函数 |
| Global State | 多个组件共享的状态 |
| Local State | 单个组件内部使用的状态 |
| Client State | 浏览器或应用内部状态 |
| Server State | 从服务器、接口或数据库获得的数据 |

---

# 14. 后续学习方向

完成入门后，可以按下面的顺序继续学习。

## 第一阶段：性能和选择器

学习：

- 为什么要使用 Selector
- 多个状态的选择
- `useShallow`
- 减少不必要重新渲染

## 第二阶段：Store 组织

学习：

- Slices Pattern
- 大型 Store 拆分
- Action 文件组织
- Store 命名规则

## 第三阶段：中间件

学习：

- `persist`
- `devtools`
- `subscribeWithSelector`
- `immer`

## 第四阶段：测试

学习：

- 测试 Store 的初始状态
- 测试 Action
- 测试状态重置
- React Testing Library

## 第五阶段：与其他工具配合

学习：

- Zustand + TanStack Query
- Zustand + React Router
- Zustand + Electron
- Zustand + IndexedDB
- Zustand + 后端 API

---

# 15. 官方资料

建议以官方文档为主，遇到问题再搜索具体关键词。

- Zustand Learn：<https://zustand.docs.pmnd.rs/learn/index>
- Zustand 文档首页：<https://zustand.docs.pmnd.rs/>
- Zustand GitHub：<https://github.com/pmndrs/zustand>

推荐阅读顺序：

1. Introduction
2. Beginner TypeScript
3. Updating State
4. Immutable State and Merging
5. Reset State
6. Persisting Store Data
7. Prevent Rerenders
8. Slices Pattern

---

# 每日学习记录模板

每天结束时填写：

```md
## 日期

### 今天学习的内容

-

### 我能解释的代码

```ts

```

### 我独立完成的功能

-

### 我遇到的问题

-

### 明天准备完成

-
```

---

# 最终建议

学习 Zustand 时，最重要的不是背 API，而是不断回答下面四个问题：

1. 这个状态应该放在哪里？
2. 哪些组件需要读取它？
3. 哪个 Action 应该修改它？
4. 状态变化后，哪些组件应该重新渲染？

推荐按照以下顺序实践：

```text
计数器
→ 悬浮菜单
→ 侧边栏
→ 主题设置
→ 当前笔记
→ 笔记数组
→ 持久化
→ Store 拆分
```

先把基础功能做出来，再研究性能优化和高级架构。能够独立完成 IRisNote 中的悬浮菜单、侧边栏、主题和笔记列表状态管理，就说明你已经真正入门 Zustand。
