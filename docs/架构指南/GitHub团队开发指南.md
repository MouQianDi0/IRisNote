## 🤖 Assistant

```markdown
# Git 协作方案与项目建议

## 方案一：小团队（2~5人）最实用

**主分支**
main
```

```
永远保持可运行状态。

**每个人开发自己的分支**
main
├── czc-ui
└── friend-editor

```

````

你：
```bash
git checkout -b czc-ui
````

```
朋友：
bash
git checkout -b friend-editor
```

### 开发时

假设你负责：

- UI
- 设置页面
- 主题系统

朋友负责：

- 编辑器
- 笔记存储
- 同步功能

直接在自己的分支开发。

### 上传代码

开发完成：

你：

```bash
git add .
git commit -m "完成主题切换"
git push origin czc-ui
```

朋友：

```bash
git add .
git commit -m "完成编辑器基础功能"
git push origin friend-editor
```

### 合并代码

GitHub 上发 **Pull Request (PR)**。

例如：

```
czc-ui
↓
main
```

审核后合并。

结果：

```
main
├── UI功能
├── 编辑器功能
└── 主题系统
```

都保留。

---

## 方案二：两人同时修改同一个文件

例如：`src/editor/index.tsx` 你和朋友都改了。

此时执行：

```bash
git pull origin main
```

可能出现：

```
CONFLICT (content): Merge conflict
```

Git 会提示冲突，文件会变成：

```diff
<<<<<<< HEAD
你的代码
=======
朋友的代码
>>>>>>> friend-editor
```

需要人工决定保留什么：**最终代码**

然后：

```bash
git add .
git commit -m "解决冲突"
```

---

## React Native 项目建议分工

如果你准备做类似 **Notesnook**：

你：

- UI
- 动画
- 主题
- 页面布局

朋友：

- SQLite
- 编辑器
- Markdown
- 数据同步

这样冲突最少。

---

## 必须养成的习惯

**每天开发前：**

```bash
git pull origin main
```

**开发完：**

```bash
git push
```

**不要：**

- 连续3天不拉代码
- 然后一次性上传（几乎必冲突）

---

## 推荐目录责任制

例如：

```
src/
├── screens/         # 你负责
├── components/      # 你负责
├── database/        # 朋友负责
├── editor/          # 朋友负责
```

谁负责哪个目录，尽量不要互相修改对方目录。

---

## 针对你要做的 React Native 仿 Notesnook 项目

我建议直接采用：

```
main
develop
feature/ui
feature/editor
feature/database
feature/sync
```

这种 **Git Flow 简化版**。

```

```
