# JWT 认证中间件详解

## 1. 没有 JWT 时的问题

没有认证时，任何请求都能拿到所有数据：

```
客户端A ── GET /api/notes ──► 服务器 ──► SELECT * FROM notes ──► 返回所有用户的笔记
客户端B ── GET /api/notes ──► 服务器 ──► SELECT * FROM notes ──► 返回所有用户的笔记
```

用户 A 能看到用户 B 的笔记，这不行。我们需要知道"这个请求是谁发的"。

---

## 2. JWT 是什么？

JWT（JSON Web Token）就是一个 **签名过的 JSON**，长这样：

```
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiYWJjQGV4YW1wbGUuY29tIn0.签名部分
│                    │                                                          │
│  Header（头部）     │  Payload（载荷 / 数据体）                                  │  Signature（签名）
│  声明算法=HS256     │  { userId: 1, email: "abc@example.com" }                  │  防篡改校验
```

三点关键：

| 特性 | 说明 |
|------|------|
| **不加密** | Payload 是 Base64 编码，任何人解码后能看到内容 —— 所以别存密码 |
| **防篡改** | 修改 Payload 中哪怕一个字符，Signature 就对不上 |
| **服务端签发** | 只有持有 `SECRET_KEY` 的服务器才能签发有效 token |

---

## 3. 完整生命周期

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            JWT 完整生命周期                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ① 注册                                                                      │
│  ┌──────────┐   POST /api/auth/register                                     │
│  │ 手机 App  ├──────────────────────────────► Express                        │
│  └──────────┘  { email, password }               │                          │
│                                                   ├─ bcrypt 加密密码          │
│                                                   ├─ INSERT INTO users       │
│                                                   ├─ jwt.sign({ userId })    │
│                                                   └─ 返回 token              │
│  ┌──────────┐  { token: "eyJ...", user: {...} }                             │
│  │ 手机 App  │◄──────────────────────────────────┘                          │
│  └────┬─────┘                                                               │
│       │ AsyncStorage.setItem("token", token)                                │
│                                                                             │
│  ② 登录                                                                      │
│  ┌──────────┐   POST /api/auth/login                                        │
│  │ 手机 App  ├──────────────────────────────► Express                        │
│  └──────────┘  { email, password }               │                          │
│                                                   ├─ SELECT * FROM users     │
│                                                   │   WHERE email = ?        │
│                                                   ├─ bcrypt.compare(密码, 哈希)│
│                                                   ├─ jwt.sign({ userId })    │
│                                                   └─ 返回 token              │
│                                                                             │
│  ③ 后续请求（关键！）                                                         │
│  ┌──────────┐   GET /api/notes                                              │
│  │ 手机 App  ├──────────────────────────────► Express                        │
│  └──────────┘  Authorization: Bearer eyJ...     │                            │
│                                                 ▼                            │
│                                          ┌──────────────┐                   │
│                                          │ authMiddleware│                   │
│                                          │              │                   │
│                                          │ 1. 取 token   │                   │
│                                          │ 2. 验证签名   │                   │
│                                          │ 3. 解析 userId│                   │
│                                          │ 4. req.userId │                   │
│                                          │    = 5        │                   │
│                                          │ 5. next()     │                   │
│                                          └──────┬───────┘                   │
│                                                 ▼                            │
│                                    SELECT * FROM notes                       │
│                                    WHERE user_id = 5   ← req.userId          │
│                                                 │                            │
│  ┌──────────┐    只返回 userId=5 的笔记        │                            │
│  │ 手机 App  │◄────────────────────────────────┘                            │
│  └──────────┘                                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 逐行解析 auth 中间件代码

```typescript
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET || "irisnote-secret-key";

// Express 中间件签名：(req, res, next) => void
export function authMiddleware(req: Request, res: Response, next: NextFunction) {

    // ─── 第 1 步：从请求头中取出 token ───
    // HTTP 请求头格式：Authorization: Bearer eyJhbGciOi...
    // split(" ") 后得到 ["Bearer", "eyJhbGciOi..."]
    const authHeader = req.headers.authorization;
    //                                   ↓
    // 如果请求头是 "Authorization: Bearer xxxxx"
    // split(" ") → ["Bearer", "xxxxx"]
    // [1]        → "xxxxx"
    const token = authHeader?.split(" ")[1];

    // ─── 第 2 步：如果没有 token，直接拒绝 ───
    if (!token) {
        res.status(401).json({ error: "未登录，请先登录" });
        return;  // ← 关键：必须 return，否则会继续执行下面的代码
    }

    // ─── 第 3 步：验证 token 并解码 ───
    try {
        // jwt.verify 做了两件事：
        //   ① 用 SECRET_KEY 重新计算签名，和 token 里的签名比对
        //   ② 如果签名一致，返回解码后的 payload
        const decoded = jwt.verify(token, SECRET_KEY) as { userId: number };

        // ─── 第 4 步：把 userId 注入到 req 对象上 ───
        // 这样后面的路由处理函数就能通过 req.userId 拿到当前用户 ID
        req.userId = decoded.userId;

        // ─── 第 5 步：放行，继续执行下一个处理函数 ───
        next();

    } catch (err) {
        // 签名对不上 → 伪造的 token
        // token 过期 → TokenExpiredError
        // token 格式错误 → JsonWebTokenError
        res.status(401).json({ error: "token 无效或已过期" });
    }
}
```

---

## 5. 流程图：一个请求经过中间件的完整链路

```
HTTP 请求到达 Express
        │
        ▼
   ① app.use(express.json())          ← 解析 JSON body
        │
        ▼
   ② app.use("/api/notes", router)    ← 路由匹配
        │
        ▼
   ③ router.get("/", authMiddleware, handler)
        │
        ├─► 先执行 authMiddleware ─────────────────────┐
        │                                               │
        │    ┌─ 取 Authorization 头                     │
        │    ├─ 没有？→ 401 返回 "未登录"（结束）         │
        │    ├─ 有 token → jwt.verify()                 │
        │    │   ├─ 失败 → 401 返回 "token无效"（结束）   │
        │    │   └─ 成功 → req.userId = 5 → next()      │
        │                                               │
        ├─► 再执行 handler ────────────────────────────┘
        │
        │    SELECT * FROM notes WHERE user_id = 5  ← req.userId
        │    返回该用户的笔记
        │
        ▼
     响应发给客户端
```

---

## 6. 核心：为什么 JWT 不可伪造？

假设攻击者截获了 token，想把自己的 `userId: 1` 改成 `userId: 999` 来看别人的数据：

```
原始 token（合法）:
Header:   { "alg": "HS256", "typ": "JWT" }
Payload:  { "userId": 1, "email": "abc@test.com" }
Signature: HMACSHA256(base64(Header) + "." + base64(Payload), SECRET_KEY)
          = "abc123xyz..."

篡改后的 token（伪造）:
Header:   { "alg": "HS256", "typ": "JWT" }
Payload:  { "userId": 999, "email": "abc@test.com" }   ← 改了 userId
Signature: "abc123xyz..."                               ← 还是旧的签名

jwt.verify() 验证过程:
  ① 用 SECRET_KEY 对新的 Header + Payload 重新计算签名
     新签名 = HMACSHA256(base64(新Header) + "." + base64(新Payload), SECRET_KEY)
            = "xyz789def..."                             ← 和旧签名不同！
  ② 比较：旧签名 "abc123xyz..." ≠ 新签名 "xyz789def..."
  ③ 签名不匹配 → 抛出错误 → 401
```

**攻击者没有 `SECRET_KEY`**，无法为篡改后的 Payload 生成正确的签名，所以伪造必然失败。

---

## 7. Express TypeScript 类型扩展

因为 Express 的 `Request` 类型默认没有 `userId` 属性，需要声明扩展：

```typescript
// src/types/express.d.ts
declare namespace Express {
    interface Request {
        userId?: number;
    }
}
```

这样 TypeScript 就不会报 `Property 'userId' does not exist on type 'Request'`。

---

## 8. 总结

| 概念 | 一句话解释 |
|------|-----------|
| JWT | 签名过的 JSON，防篡改不防偷看 |
| 中间件 | 在路由处理前执行的函数，可以拦截 / 修改 / 放行请求 |
| `jwt.sign()` | 用密钥给数据加签名，生成 token |
| `jwt.verify()` | 用密钥验证签名，返回原始数据 |
| `req.userId` | 中间件注入的用户 ID，后续代码直接取用 |
| `next()` | 放行，交给 Express 继续处理 |

本质就是：**从前端发请求时带上 token → 中间件验证 token 真伪 → 把用户 ID 注入到请求上下文 → 所有数据库查询自动过滤当前用户的数据**。
