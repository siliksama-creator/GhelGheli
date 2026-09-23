import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// میزبان‌های مجاز فقط برای سرورِ توسعه/پیش‌نمایشِ محلی است.
// در تولید، nginx پوشهٔ `dist` را سرو می‌کند و این تنظیم اصلاً خوانده
// نمی‌شود؛ پس هیچ سطحِ حمله‌ای به سرورِ واقعی اضافه نمی‌کند.
// دلیلِ وجودش: بازبینیِ ظاهری روی نمای واقعیِ گوشی بدون این تنظیم
// با «Blocked request» (۴۰۳) رد می‌شد و اندازه‌گیریِ زنده ممکن نبود.
const previewHosts = [".e2b.app", "localhost", "127.0.0.1"];

export default defineConfig({
  plugins: [react()],
  // Hidden sourcemaps (مثل پنل ادمین): .map ساخته ولی در باندل ارجاع نمی‌شود؛
  // deploy.sh آن‌ها را خصوصی بایگانی و از dist پاک می‌کند — هرگز سرو نمی‌شوند.
  build: { sourcemap: 'hidden' },
  server: { host: "0.0.0.0", allowedHosts: previewHosts },
  preview: { host: "0.0.0.0", allowedHosts: previewHosts },
});
