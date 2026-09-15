# IRisNote 服务端部署手册（Docker 生产版）

> Version：1.0
> Author：ChatGPT
> Update：2026-06-10

------

# 一、项目介绍

本项目采用 Docker Compose 进行容器化部署，实现：

```
React Native App
        │
        │ HTTPS
        ▼
     Nginx
        │
        ▼
  NestJS / Express API
        │
 ┌──────┼──────────┐
 │      │          │
 ▼      ▼          ▼
PostgreSQL  Redis  MinIO
```

整个项目所有服务均运行在 Docker 中，实现：

- 数据持久化
- 一键启动
- 一键更新
- 自动备份
- 易于迁移
- 易于扩容

------

# 二、服务器要求

推荐配置：

| 项目           | 推荐配置         |
| -------------- | ---------------- |
| CPU            | 2 Core           |
| 内存           | 4GB（推荐8GB）   |
| 系统           | Ubuntu 22.04 LTS |
| Docker         | 最新稳定版       |
| Docker Compose | 最新稳定版       |

更新服务器：

```bash
sudo apt update
sudo apt upgrade -y
```

------

# 三、安装 Docker

安装：

```bash
curl -fsSL https://get.docker.com | sh
```

检查：

```bash
docker -v
docker compose version
```

添加当前用户权限：

```bash
sudo usermod -aG docker $USER
```

重新登录服务器。

------

# 四、项目目录规划

```
IRisNote/

├── docker-compose.yml

├── .env

├── backend/
│
├── nginx/
│
├── postgres/
│   ├── data/
│   └── init/
│
├── redis/
│
├── minio/
│
├── backup/
│
├── logs/
│
└── scripts/
```

创建：

```bash
mkdir IRisNote

cd IRisNote

mkdir backend
mkdir nginx
mkdir redis
mkdir minio

mkdir -p postgres/data
mkdir -p postgres/init

mkdir backup
mkdir logs
mkdir scripts
```

------

# 五、Docker Compose

创建：

docker-compose.yml

```yaml
services:

  postgres:

    image: postgres:17

    container_name: irisnote-postgres

    restart: always

    environment:

      POSTGRES_USER: iris

      POSTGRES_PASSWORD: ChangeYourPassword

      POSTGRES_DB: irisnote

    ports:

      - "127.0.0.1:5432:5432"

    volumes:

      - ./postgres/data:/var/lib/postgresql/data

      - ./postgres/init:/docker-entrypoint-initdb.d

    healthcheck:

      test: ["CMD-SHELL","pg_isready -U iris"]

      interval: 10s

      timeout: 5s

      retries: 5

  redis:

    image: redis:7

    container_name: irisnote-redis

    restart: always

    command: redis-server --appendonly yes

    volumes:

      - ./redis:/data

  minio:

    image: minio/minio

    container_name: irisnote-minio

    restart: always

    command: server /data --console-address ":9001"

    environment:

      MINIO_ROOT_USER: admin

      MINIO_ROOT_PASSWORD: ChangePassword

    volumes:

      - ./minio:/data

    ports:

      - "9000:9000"

      - "9001:9001"
```

------

# 六、启动服务

启动：

```bash
docker compose up -d
```

查看：

```bash
docker ps
```

查看日志：

```bash
docker compose logs

docker compose logs postgres

docker compose logs redis

docker compose logs minio
```

停止：

```bash
docker compose down
```

------

# 七、PostgreSQL

进入数据库：

```bash
docker exec -it irisnote-postgres psql -U iris -d irisnote
```

查看数据库：

```
\l
```

查看表：

```
\dt
```

退出：

```
\q
```

------

# 八、数据库设计

users

```
id UUID

username

email

password_hash

avatar

created_at

updated_at
```

notes

```
id UUID

user_id

title

content

created_at

updated_at
```

folders

```
id

user_id

parent_id

name
```

tags

```
id

user_id

name
```

attachments

```
id

note_id

filename

url

size
```

------

# 九、Node 环境变量

.env

```
DATABASE_URL=postgresql://iris:password@postgres:5432/irisnote

REDIS_URL=redis://redis:6379

MINIO_ENDPOINT=minio

MINIO_PORT=9000

MINIO_ACCESS_KEY=admin

MINIO_SECRET_KEY=password

JWT_SECRET=YourJWTSecret
```

------

# 十、Nginx

推荐结构：

```
Internet

↓

HTTPS

↓

Nginx

↓

NestJS

↓

PostgreSQL
```

配置：

```
server {

    listen 443 ssl;

    server_name api.xxx.com;

    location / {

        proxy_pass http://backend:3000;

    }

}
```

------

# 十一、数据持久化

数据保存在：

```
postgres/data

redis/

minio/
```

即使：

```
docker compose down

docker compose up -d
```

数据不会丢失。

------

# 十二、数据库备份

创建：

scripts/backup.sh

```bash
#!/bin/bash

DATE=$(date +%F_%H-%M)

docker exec irisnote-postgres \
pg_dump -U iris irisnote \
> backup/irisnote_$DATE.sql
```

授权：

```bash
chmod +x scripts/backup.sh
```

执行：

```bash
./scripts/backup.sh
```

------

# 十三、数据库恢复

```bash
cat backup.sql | docker exec -i irisnote-postgres psql -U iris irisnote
```

------

# 十四、更新流程

更新代码：

```bash
git pull
```

重新构建：

```bash
docker compose build
```

启动：

```bash
docker compose up -d
```

------

# 十五、查看容器状态

```
docker ps

docker stats

docker images

docker volume ls

docker network ls
```

------

# 十六、日志管理

查看：

```
docker logs irisnote-postgres

docker logs irisnote-redis

docker logs irisnote-minio
```

实时查看：

```
docker logs -f irisnote-postgres
```

------

# 十七、服务器安全

推荐开放端口：

```
22 SSH

80 HTTP

443 HTTPS
```

关闭：

```
5432 PostgreSQL

6379 Redis

9000 MinIO

9001 MinIO Console
```

数据库仅允许 Docker 内部访问。

------

# 十八、生产环境建议

建议部署：

```
IRisNote

├── Nginx

├── NestJS API

├── PostgreSQL

├── Redis

├── MinIO

├── Docker Compose

├── HTTPS

├── 自动备份

└── Git 自动更新
```

------

# 十九、未来扩展

可继续增加：

```
Worker

WebSocket

全文搜索

消息推送

邮件服务

对象存储CDN

AI总结服务

OCR识别服务
```

------

# 二十、部署流程总结

```
购买服务器

↓

安装 Ubuntu

↓

安装 Docker

↓

克隆项目

↓

配置 .env

↓

docker compose up -d

↓

配置 Nginx

↓

配置 HTTPS

↓

完成部署

↓

配置自动备份

↓

上线
```

------

# 推荐最终目录

```
IRisNote/

├── backend/

├── nginx/

├── postgres/

├── redis/

├── minio/

├── backup/

├── logs/

├── scripts/

├── docker-compose.yml

└── .env
```

> 本文档适合作为 IRisNote 服务端部署与运维文档，推荐与项目代码一同维护，并在后续增加 CI/CD、自动更新、监控告警、Prometheus、Grafana 等模块。