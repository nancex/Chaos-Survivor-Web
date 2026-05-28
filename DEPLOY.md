# 部署说明（Nginx 与 Docker）

## 1. 使用 Nginx 直接部署

### 1.1 上传项目
把当前项目目录上传到服务器，例如：

```bash
sudo mkdir -p /var/www/survivor
sudo rsync -av --delete ./ /var/www/survivor/
```

### 1.2 配置 Nginx
项目已提供配置文件：`deploy/nginx/survivor.conf`。

在服务器执行：

```bash
sudo cp /var/www/survivor/deploy/nginx/survivor.conf /etc/nginx/conf.d/survivor.conf
```

按实际情况修改：
- `server_name your-domain.com;` 改成你的域名或服务器 IP
- `root /var/www/survivor;` 改成你的项目实际路径（如果不同）

### 1.3 检查并重载

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 1.4 访问

默认端口是 `5000`：

```text
http://your-domain.com:5000/
```

---

## 2. 使用 Docker 部署

项目已提供：
- `Dockerfile`
- `docker-compose.yml`
- `nginx/default.conf`

### 2.1 构建并启动

```bash
docker compose up -d --build
```

### 2.2 查看状态与日志

```bash
docker compose ps
docker compose logs -f
```

### 2.3 访问

`docker-compose.yml` 已映射端口 `5000:80`，访问：

```text
http://your-server-ip:5000/
```

### 2.4 停止与重启

```bash
docker compose down
docker compose up -d
```
