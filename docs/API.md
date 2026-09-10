# IRisNote API 接口文档

## 基础信息

- 生产环境：`https://tech-mou.top/api`
- 开发环境：`http://localhost:3000/api`（或 `3001`，取决于 `DEV_AUTH_BYPASS`）
- 认证方式：JWT（Header: `Authorization: Bearer <token>`），有效期 30 天
- Content-Type: `application/json`
- 设备标识：验证码相关接口建议携带 `X-Device-Id`；缺失时服务端使用 IP 与 User-Agent 生成降级标识

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
        "category_id": null,
        "created_at": "2026-06-15T12:00:00.000Z",
        "is_pinned": false,
        "is_starred": false
    }
]
```

---

### 创建笔记

```
POST /api/notes
```

**请求体：**

| 参数        | 类型    | 必填 | 说明                    |
| ----------- | ------- | ---- | ----------------------- |
| title       | string  | 是   | 笔记标题                |
| content     | string  | 是   | 笔记内容                |
| category_id | integer | 否   | 分类 ID，不传为 null    |

**请求示例：**

```json
{
    "title": "学习笔记",
    "content": "今天学了 Express...",
    "category_id": 3
}
```

**响应示例：**

```json
{
    "id": 1,
    "user_id": 1,
    "title": "学习笔记",
    "content": "今天学了 Express...",
    "category_id": 3,
    "created_at": "2026-06-15T12:00:00.000Z",
    "is_pinned": false,
    "is_starred": false
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 401 | 未登录 |
| 500 | 创建笔记失败 |

---

### 更新笔记

```
PUT /api/notes/:id
```

> 只能更新属于自己的笔记。按请求体中出现的字段做**部分更新**，未出现的字段保留数据库现值（2026-09-09 起；此前线上旧版仅更新置顶/标星，正文字段会被静默忽略）。

**请求体（以下字段均可选，至少提供一个）：**

| 参数        | 类型    | 说明                                       |
| ----------- | ------- | ------------------------------------------ |
| title       | string  | 笔记标题；出现时不能为空                   |
| content     | string  | 笔记内容                                   |
| category_id | integer | 分类 ID；传 `null` 表示移除分类            |
| is_pinned   | boolean | 是否置顶                                   |
| is_starred  | boolean | 是否标星                                   |

**请求示例（置顶一篇笔记，不携带正文字段）：**

```json
{
    "is_pinned": true
}
```

**响应示例（返回更新后的完整笔记）：**

```json
{
    "id": 1,
    "user_id": 1,
    "title": "标题",
    "content": "内容",
    "category_id": null,
    "created_at": "2026-06-15T12:00:00.000Z",
    "is_pinned": true,
    "is_starred": false
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 笔记标题不能为空 / 分类 ID 无效 / 没有可更新的字段 |
| 401 | 未登录 |
| 404 | 笔记不存在 |
| 500 | 更新笔记失败 |

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

### 批量删除笔记

```
POST /api/notes/batch-delete
```

**请求体：**

| 参数 | 类型    | 必填 | 说明           |
| ---- | ------- | ---- | -------------- |
| ids  | integer[] | 是   | 笔记 ID 非空数组 |

**请求示例：**

```json
{
    "ids": [1, 2, 3]
}
```

**响应示例：**

```json
{ "success": true }
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | ids 必须是非空数组 |
| 401 | 未登录 |
| 500 | 批量删除笔记失败 |

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
| 429 | IP 或设备验证请求过于频繁 |
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
| 429 | IP 或设备验证请求过于频繁 |
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
| 429 | IP 或设备验证请求过于频繁 |
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

### 获取头像

```
GET /api/user/avatar/:filename
```

> 不需要登录

**路径参数：**
| 参数      | 类型   | 必填 | 说明              |
| --------- | ------ | ---- | ----------------- |
| filename  | string | 是   | 头像文件名        |

**响应：**
- 成功：返回图片二进制数据
- 失败：返回错误 JSON

**错误：**
| 状态码 | 说明 |
|--------|------|
| 404 | 头像不存在 |
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
    "avatar": "https://api.example.com/api/user/avatar/1_1718500000000.png"
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

**频率限制：**

- 同一邮箱 60 秒内只能发送一次
- 同一 IP 10 分钟最多发送 20 次
- 同一设备 10 分钟最多发送 10 次
- 触发限制时响应包含 `retryAfter` 和 `scope`，并设置 `Retry-After` Header

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 参数缺失 / type 无效 |
| 404 | 登录场景：该邮箱未注册 |
| 409 | 注册场景：该邮箱已被注册 |
| 429 | 邮箱、IP 或设备发送太频繁（返回 `retryAfter` 和 `scope`） |
| 500 | 发送失败 |

---

### 校验验证码

```
POST /api/verify/check
```

> 仅校验验证码是否正确，不消费（不删除 Redis 中的验证码）

同一验证码最多允许错误 5 次，第 5 次错误后立即作废。校验请求同时受以下限制：同一 IP 10 分钟最多 50 次，同一设备 10 分钟最多 20 次。注册和登录接口会在业务条件满足后原子消费验证码，确保同一验证码只能成功使用一次。

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

验证码错误但尚未达到上限时会返回剩余次数：

```json
{
    "error": "验证码错误",
    "remainingAttempts": 3
}
```

**错误：**
| 状态码 | 说明 |
|--------|------|
| 400 | 参数缺失 / type 无效 / 验证码错误或过期 |
| 429 | IP 或设备校验过于频繁（返回 `retryAfter` 和 `scope`） |
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
