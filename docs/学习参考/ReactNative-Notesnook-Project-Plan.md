# React Native 仿 Notesnook 项目目录规划

## 项目目标

- UI 和交互参考 Notesnook
- React Native 开发（Android/iOS）
- 支持后续二次开发
- 先实现本地笔记功能
- 后续逐步增加同步、加密等高级功能

---

# 项目结构

```text
notes-lite/
│
├── app/
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── TabNavigator.tsx
│   │   └── StackNavigator.tsx
│   │
│   ├── screens/
│   │   ├── Home/
│   │   ├── NoteEditor/
│   │   ├── Notebook/
│   │   ├── Settings/
│   │   └── Search/
│   │
│   ├── components/
│   │   ├── NoteCard/
│   │   ├── EditorToolbar/
│   │   ├── SearchBar/
│   │   ├── FloatingButton/
│   │   └── Modal/
│   │
│   ├── store/
│   │   ├── noteStore.ts
│   │   ├── notebookStore.ts
│   │   └── settingsStore.ts
│   │
│   ├── services/
│   │   ├── database/
│   │   ├── sync/
│   │   └── search/
│   │
│   ├── hooks/
│   ├── theme/
│   ├── utils/
│   ├── types/
│   └── assets/
│
├── package.json
├── tsconfig.json
└── README.md
```

---

# 数据库设计

## notes 表

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  notebook_id TEXT
);
```

## notebooks 表

```sql
CREATE TABLE notebooks (
  id TEXT PRIMARY KEY,
  name TEXT
);
```

---

# 状态管理

推荐使用 Zustand

```bash
yarn add zustand
```

目录：

```text
store/
├── noteStore.ts
├── notebookStore.ts
└── settingsStore.ts
```

---

# 编辑器模块

```text
components/
└── Editor/
    ├── Editor.tsx
    ├── Toolbar.tsx
    ├── MarkdownParser.ts
    └── EditorStyles.ts
```

### 第一版

- 纯文本编辑

### 第二版

- Markdown

### 第三版

- 富文本编辑

---

# 导航系统

推荐 React Navigation

```bash
yarn add @react-navigation/native
```

底部导航：

- 首页
- 搜索
- 设置

---

# 主题系统

```text
theme/
├── colors.ts
├── dark.ts
├── light.ts
└── index.ts
```

示例：

```ts
export const colors = {
  background: "#111111",
  card: "#1A1A1A",
  text: "#FFFFFF",
  primary: "#4F8CFF"
};
```

---

# 后续扩展

## 标签系统

```text
services/tags/
```

## 回收站

```text
services/trash/
```

## 附件系统

```text
services/attachments/
```

## 云同步

```text
services/sync/
```

可接入：

- WebDAV
- Firebase
- Supabase
- 自建服务器

---

# 开发路线图

## 第一阶段

实现：

- 创建笔记
- 编辑笔记
- 删除笔记
- SQLite 存储

预计：1~2 周

---

## 第二阶段

实现：

- Markdown
- 搜索
- 标签

预计：2 周

---

## 第三阶段

实现：

- 图片附件
- 文件附件

预计：2 周

---

## 第四阶段

实现：

- 登录
- 云同步
- 多设备同步

预计：1个月以上

---

# 推荐大型项目结构

```text
src/
├── features/
│   ├── notes/
│   ├── editor/
│   ├── notebooks/
│   ├── tags/
│   └── settings/
│
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── theme/
│   └── utils/
│
├── database/
├── navigation/
└── App.tsx
```

这种 Feature First 架构更适合长期维护和二次开发。9
