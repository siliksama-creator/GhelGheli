# راهنمای استقرار روی VPS اوبونتو

فرض‌ها:

- دامنه API: `api.example.com`
- دامنه پنل: `admin.example.com`
- مسیر پروژه: `/var/www/GhelGheli`

## ۱) نصب پیش‌نیازها

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx postgresql postgresql-contrib certbot python3-certbot-nginx build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## ۲) ساخت دیتابیس PostgreSQL

```bash
sudo -u postgres psql
CREATE USER ghelgheli WITH PASSWORD 'A_STRONG_PASSWORD';
CREATE DATABASE ghelgheli OWNER ghelgheli;
\q
```

## ۳) کلون پروژه و تنظیم backend

```bash
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
git clone https://github.com/siliksama-creator/GhelGheli.git /var/www/GhelGheli
cd /var/www/GhelGheli/backend
cp .env.example .env
nano .env
```

نمونه مهم‌ترین متغیرها:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgres://ghelgheli:A_STRONG_PASSWORD@localhost:5432/ghelgheli
JWT_SECRET=یک_رشته_بسیار_طولانی_و_تصادفی
OTP_DEV_MODE=false
CORS_ORIGIN=https://admin.example.com
FCM_SERVICE_ACCOUNT_JSON={...json firebase service account...}
```

سپس:

```bash
npm install --omit=dev
npm run migrate
npm run seed:admin
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## ۴) build پنل React

```bash
cd /var/www/GhelGheli/admin
npm install
VITE_API_BASE=https://api.example.com npm run build
```

## ۵) تنظیم Nginx reverse proxy

```bash
sudo nano /etc/nginx/sites-available/ghelgheli
```

```nginx
server {
  server_name api.example.com;
  location /socket.io/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  server_name admin.example.com;
  root /var/www/GhelGheli/admin/dist;
  index index.html;
  location / { try_files $uri /index.html; }
}
```

فعال‌سازی:

```bash
sudo ln -s /etc/nginx/sites-available/ghelgheli /etc/nginx/sites-enabled/ghelgheli
sudo nginx -t
sudo systemctl reload nginx
```

## ۶) SSL رایگان Let's Encrypt

```bash
sudo certbot --nginx -d api.example.com -d admin.example.com
sudo certbot renew --dry-run
```

## ۷) نکات امنیتی production

- `JWT_SECRET` باید طولانی و تصادفی باشد.
- `OTP_DEV_MODE=false` و اتصال به سرویس پیامک واقعی الزامی است.
- رمز ادمین seed شده را فوراً تغییر دهید یا ادمین جدید بسازید.
- بکاپ روزانه PostgreSQL تنظیم کنید.
- برای APK release امضاشده، keystore را فقط در GitHub Secrets نگهداری کنید.
