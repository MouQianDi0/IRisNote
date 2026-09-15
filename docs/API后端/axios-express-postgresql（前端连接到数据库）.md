# axios + Express + PostgreSQL 完整示例

## 架构图

```
Expo 前端 (IRisNote)
    ↓ axios 发 HTTP 请求
Express 后端 (irisapi)
    ↓ 查询/写入数据
PostgreSQL 数据库
```

## 1. PostgreSQL 数据库

创建数据库和表：

```sql
CREATE DATABASE irisnote;

\c irisnote

CREATE TABLE notes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 2. Express 后端 (irisapi)

### 安装依赖

```bash
cd "d:\Note project\irisapi"
npm install express cors pg
npm install -D typescript @types/express @types/cors @types/pg tsx
```

### 数据库连接 `src/db.ts`

```typescript
import { Pool } from "pg";

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "irisnote",
  password: "你的密码",
  port: 5432,
});

export default pool;
```

### 笔记路由 `src/routes/notes.ts`

```typescript
import { Router } from "express";
import pool from "../db";

const router = Router();

// 获取所有笔记
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM notes ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "获取笔记失败" });
  }
});

// 创建笔记
router.post("/", async (req, res) => {
  const { title, content } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO notes (title, content) VALUES ($1, $2) RETURNING *",
      [title, content]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "创建笔记失败" });
  }
});

// 删除笔记
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM notes WHERE id = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "删除笔记失败" });
  }
});

export default router;
```

### 入口文件 `src/index.ts`

```typescript
import express from "express";
import cors from "cors";
import notesRouter from "./routes/notes";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use("/api/notes", notesRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

### package.json 脚本

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts"
  }
}
```

启动后端：

```bash
npm run dev
```

## 3. Expo 前端 (IRisNote)

### 安装 axios

```bash
cd "d:\Note project\IRisNote"
npm install axios
```

### axios 配置 `src/api/client.ts`

```typescript
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api",
});

export default api;
```

### 使用示例

```typescript
import api from "../api/client";

// 获取笔记
const { data: notes } = await api.get("/notes");

// 创建笔记
const { data: newNote } = await api.post("/notes", {
  title: "新笔记",
  content: "内容"
});

// 删除笔记
await api.delete(`/notes/${id}`);
```

## 流程说明

1. **前端**：用户点击"保存笔记" → axios 发 POST 请求到 Express
2. **后端**：Express 收到请求 → 用 SQL 查询 PostgreSQL → 返回结果
3. **前端**：axios 收到响应 → 更新 UI
