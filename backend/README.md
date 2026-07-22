# Backend — GhelGheli

## اجرا

```bash
cp .env.example .env
npm install
npm run migrate
npm run seed:admin
npm run dev
```

- Swagger: `http://localhost:4000/docs`
- Health: `http://localhost:4000/health`

در حالت توسعه `OTP_DEV_MODE=true` کد تایید در پاسخ API و لاگ سرور برمی‌گردد. در production باید به سرویس پیامک واقعی متصل شود.
