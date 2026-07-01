# IRisNote API 接口文档

## 基础信息

- 生产环境：`https://tech-mou.top/api`
- 开发环境：`http://localhost:3000/api`（或 `3001`，取决于 `DEV_AUTH_BYPASS`）
- 认证方式：JWT（Header: `Authorization: Bearer <token>`），有效期 30 天
- Content-Type: `application/json`

---

## 目录

- [根路由](#根路由)
- [笔记接口](#笔记接口)
- [分类接口](#分类接口)
- [认证接口](#认证接口)
- [用户接口](#用户接口)
- [验证码接口](#验证码接口)
- [错误码说明](#错误码说明)

---

## 根路由

### 健康检查

```
GET /
```

**响应示例：**

```json
{ "message": "Express is working" }
```

---

## 笔记接口

> 所有笔记接口需要登录，Header 携带 `Authorization: Bearer <token>`

### 获取当前用户的所有笔记

```
GET /api/notes
```

**响应示例：**

```json
[
    {
        "id": 1,
        "user_id": 1,
        "title": "标题",
        "content": "内容",
        "created_at": "2026-06-15T12:00:00.000Z"
    }
]
```

---

### 创建笔记

```
POST /api/notes
```

**请求体：**

| 参数    | 类型   | 必填 | 说明     |
| ------- | ------ | ---- | -------- |
| title   | string | 是   | 笔记标题 |
| content | string | 是   | 笔记内容 |

**请求示例：**

```json
{
    "title": "学习笔记",
    "content": "今天学了 Express..."
}
```

**响应示例：**

```json
{
    "id": 1,
    "user_id": 1,
    "title": "学习笔记",
    "content": "今天学了 Express...",
    "created_at": "2026-06-15T12:00:00.000Z"
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 401 | 未登录 |
| 500 | 创建笔记失败 |

---

### 删除笔记

```
DELETE /api/notes/:id
```

> 只能删除属于自己的笔记

**响应示例：**

```json
{ "success": true }
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 401 | 未登录 |
| 500 | 删除笔记失败 |

---

## 分类接口

> 所有分类接口需要登录，Header 携带 `Authorization: Bearer <token>`

### 获取当前用户的所有分类

```
GET /api/categories
```

**响应示例：**

```json
[
    {
        "id": 1,
        "user_id": 1,
        "name": "技术笔记",
        "icon": "Folder",
        "is_pinned": false,
        "is_starred": false,
        "created_at": "2026-06-15T12:00:00.000Z"
    }
]
```

---

### 创建分类

```
POST /api/categories
```

**请求体：**

| 参数 | 类型   | 必填 | 说明                         |
| ---- | ------ | ---- | ---------------------------- |
| name | string | 是   | 分类名称，不能超过 50 个字符 |
| icon | string | 否   | 图标名称，默认为 "Folder"    |

**请求示例：**

```json
{
    "name": "技术笔记",
    "icon": "Code"
}
```

**响应示例：**

```json
{
    "id": 1,
    "user_id": 1,
    "name": "技术笔记",
    "icon": "Code",
    "is_pinned": false,
    "is_starred": false,
    "created_at": "2026-06-15T12:00:00.000Z"
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 分类名称为空 / 名称超过 50 个字符 |
| 401 | 未登录 |
| 500 | 创建分类失败 |

---

### 更新分类

```
PUT /api/categories/:id
```

> 只能更新属于自己的分类

**请求体：**

| 参数      | 类型    | 必填 | 说明         |
| --------- | ------- | ---- | ------------ |
| name      | string  | 否   | 分类名称     |
| icon      | string  | 否   | 图标名称     |
| is_pinned | boolean | 否   | 是否置顶     |
| is_starred | boolean | 否   | 是否收藏     |

**请求示例：**

```json
{
    "name": "更新后的分类名",
    "is_pinned": true
}
```

**响应示例：**

```json
{
    "id": 1,
    "user_id": 1,
    "name": "更新后的分类名",
    "icon": "Folder",
    "is_pinned": true,
    "is_starred": false,
    "created_at": "2026-06-15T12:00:00.000Z"
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 名称超过 50 个字符 |
| 401 | 未登录 |
| 404 | 分类不存在 |
| 500 | 更新分类失败 |

---

### 删除分类

```
DELETE /api/categories/:id
```

> 只能删除属于自己的分类

**响应示例：**

```json
{ "success": true }
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 401 | 未登录 |
| 404 | 分类不存在 |
| 500 | 删除分类失败 |

---

## 认证接口

### 注册

```
POST /api/auth/register
```

**请求体：**

| 参数     | 类型   | 必填 | 说明                                       |
| -------- | ------ | ---- | ------------------------------------------ |
| email    | string | 是   | 邮箱地址                                   |
| password | string | 是   | 密码，至少 6 位                            |
| nickname | string | 否   | 昵称                                       |
| code     | string | 是   | 邮箱验证码（先调 `/api/verify/send` 获取） |

**请求示例：**

```json
{
    "email": "user@example.com",
    "password": "123456",
    "nickname": "小明",
    "code": "123456"
}
```

**响应示例：**

```json
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": 1,
        "email": "user@example.com",
        "nickname": "小明",
        "created_at": "2026-06-15T12:00:00.000Z"
    }
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 参数缺失 / 密码过短 / 验证码错误或过期 |
| 409 | 该邮箱已被注册 |
| 500 | 注册失败 |

---

### 密码登录

```
POST /api/auth/login
```

**请求体：**

| 参数     | 类型   | 必填 | 说明                                          |
| -------- | ------ | ---- | --------------------------------------------- |
| email    | string | 是   | 邮箱                                          |
| password | string | 是   | 密码                                          |
| code     | string | 是   | 验证码（`/api/verify/send` 获取，type=login） |

**请求示例：**

```json
{
    "email": "user@example.com",
    "password": "123456",
    "code": "654321"
}
```

**响应示例：**

```json
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": 1,
        "email": "user@example.com",
        "nickname": "小明",
        "avatar": null,
        "created_at": "2026-06-15T12:00:00.000Z"
    }
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 参数缺失 / 验证码错误或过期 |
| 401 | 邮箱或密码错误 |
| 500 | 登录失败 |

---

### 验证码登录

```
POST /api/auth/login-code
```

> 不需要密码，仅用邮箱 + 验证码登录

**请求体：**

| 参数  | 类型   | 必填 | 说明   |
| ----- | ------ | ---- | ------ |
| email | string | 是   | 邮箱   |
| code  | string | 是   | 验证码 |

**请求示例：**

```json
{
    "email": "user@example.com",
    "code": "654321"
}
```

**响应示例：**

```json
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": 1,
        "email": "user@example.com",
        "nickname": "小明",
        "avatar": null,
        "created_at": "2026-06-15T12:00:00.000Z"
    }
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 参数缺失 / 验证码错误或过期 |
| 401 | 该邮箱未注册 |
| 500 | 登录失败 |

---

## 用户接口

> 所有用户接口需要登录，Header 携带 `Authorization: Bearer <token>`

### 获取用户信息

```
GET /api/user/profile
```

**响应示例：**

```json
{
    "user": {
        "id": 1,
        "email": "user@example.com",
        "nickname": "小明",
        "avatar": "http://127.0.0.1:9000/avatars/1_1718500000000.jpg",
        "created_at": "2026-06-15T12:00:00.000Z"
    }
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 401 | 未登录 |
| 404 | 用户不存在 |
| 500 | 获取失败 |

---

### 上传头像

```
POST /api/user/avatar
```

**请求体：**

| 参数   | 类型   | 必填 | 说明                                             |
| ------ | ------ | ---- | ------------------------------------------------ |
| avatar | string | 是   | Base64 图片数据，最大 2MB，支持 jpg/png/gif/webp |

**请求示例：**

```json
{
    "avatar": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

**响应示例：**

```json
{
    "avatar": "http://127.0.0.1:9000/avatars/1_1718500000000.png"
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 头像数据为空 / 格式无效 / 超过 2MB / 不支持的格式 |
| 401 | 未登录 |
| 500 | 上传失败 |

---

## 验证码接口

### 发送验证码

```
POST /api/verify/send
```

**请求体：**

| 参数  | 类型   | 必填 | 说明                      |
| ----- | ------ | ---- | ------------------------- |
| email | string | 是   | 邮箱地址                  |
| type  | string | 是   | `"register"` 或 `"login"` |

**请求示例：**

```json
{
    "email": "user@example.com",
    "type": "register"
}
```

**响应示例：**

```json
{ "message": "验证码已发送" }
```

**频率限制：** 同一邮箱 60 秒内只能发送一次

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 参数缺失 / type 无效 |
| 404 | 登录场景：该邮箱未注册 |
| 409 | 注册场景：该邮箱已被注册 |
| 429 | 发送太频繁（返回 `retryAfter` 秒数） |
| 500 | 发送失败 |

---

### 校验验证码

```
POST /api/verify/check
```

> 仅校验验证码是否正确，不消费（不删除 Redis 中的验证码）

**请求体：**

| 参数  | 类型   | 必填 | 说明                      |
| ----- | ------ | ---- | ------------------------- |
| email | string | 是   | 邮箱                      |
| type  | string | 是   | `"register"` 或 `"login"` |
| code  | string | 是   | 6 位数字验证码            |

**请求示例：**

```json
{
    "email": "user@example.com",
    "type": "register",
    "code": "123456"
}
```

**响应示例：**

```json
{ "valid": true }
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 参数缺失 / type 无效 / 验证码错误或过期 |
| 500 | 校验失败 |

---

## 错误码说明

| 状态码 | 含义     |
| ------ | -------- |
| 200    | 成功     |
| 201    | 创建成功 |
| 400    | 请求参数有误 |
| 401    | 未登录或凭据无效 |
| 404    | 资源不存在 |
| 409    | 资源冲突（如邮箱已注册） |
| 429    | 请求过于频繁 |
| 500    | 服务器内部错误 |
