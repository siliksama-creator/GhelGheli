#!/usr/bin/env node
/**
 * OpenAPI از خود routeهای Express ساخته می‌شود تا سند دوباره ۱۸ operation
 * نماند در حالی که سرور بیش از ۱۶۰ مسیر دارد. این generator قرارداد پایه
 * (method/path/auth/path params/body/statusها) را کامل نگه می‌دارد؛ schemaهای
 * تخصصی را می‌توان روی خروجی توسعه داد، ولی هیچ endpointی دیگر گم نمی‌شود.
 */
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const root = path.join(__dirname, '..');
function routeFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...routeFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

// server.js owns the unprefixed health route. Every focused router is mounted
// at /api, including nested photo-card route modules. Discovering recursively
// keeps documentation generation compatible with modularizing server.js.
const files = [
  ['src/server.js', false],
  ...routeFiles(path.join(root, 'src', 'routes'))
    .map(full => [path.relative(root, full), true]),
];
const routeRe = /\b(app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const publicRoutes = new Set([
  'GET /health',
  'GET /api/games',
  'POST /api/auth/request-otp',
  'POST /api/auth/verify-otp',
  'POST /api/auth/register',
  'POST /api/auth/register-password',
  'POST /api/auth/login',
  'POST /api/auth/forgot-password/reset',
  'GET /api/chat/canned-messages',
]);

const faMethod = { get: 'دریافت', post: 'ایجاد/ارسال', put: 'جایگزینی', patch: 'ویرایش', delete: 'حذف' };
const tags = p => {
  if (p === '/health') return ['System'];
  if (p.includes('/auth/')) return ['Auth'];
  if (p.includes('/admin/')) return ['Admin'];
  if (p.includes('/photo-cards')) return ['Photo cards'];
  if (p.includes('/games') || p.includes('/card-duel')) return ['Games'];
  if (p.includes('/wallet') || p.includes('/withdraw')) return ['Wallet'];
  if (p.includes('/league')) return ['League'];
  if (p.includes('/chat')) return ['Chat'];
  if (p.includes('/support')) return ['Support'];
  if (p.includes('/notification')) return ['Notifications'];
  if (p.includes('/shop')) return ['Shop'];
  if (p.includes('/reward')) return ['Rewards'];
  if (p.includes('/pass')) return ['Battle pass'];
  if (p.includes('/wheel')) return ['Wheel'];
  if (p.includes('/profile') || p.includes('/users')) return ['Users'];
  return ['API'];
};

function openapiPath(raw) {
  // Express optional param یک endpoint بدون پارامتر هم دارد؛ نسخهٔ دارای
  // پارامتر در سند می‌آید و پایین‌تر variant بدون پارامتر هم تولید می‌شود.
  return raw.replace(/:([A-Za-z][A-Za-z0-9_]*)\??/g, '{$1}');
}
function operationId(method, p) {
  return `${method}_${p}`.replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function paramsFor(p) {
  return [...p.matchAll(/\{([^}]+)\}/g)].map(m => ({
    name: m[1], in: 'path', required: true,
    schema: { type: 'string' },
  }));
}
function response(description) {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/JsonResponse' } } },
  };
}

const routes = [];
for (const [rel, mountedAtApi] of files) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const m of src.matchAll(routeRe)) {
    let raw = m[3];
    if (mountedAtApi) raw = '/api' + raw;
    routes.push({ method: m[2].toLowerCase(), raw });
    if (raw.includes('/:tierId?')) routes.push({ method: m[2].toLowerCase(), raw: raw.replace('/:tierId?', '') });
  }
}

const paths = {};
for (const { method, raw } of routes.sort((a, b) => a.raw.localeCompare(b.raw) || a.method.localeCompare(b.method))) {
  const p = openapiPath(raw);
  paths[p] ||= {};
  const key = `${method.toUpperCase()} ${raw.replace(/\?$/, '')}`;
  const op = {
    tags: tags(p),
    summary: `${faMethod[method]} ${p}`,
    operationId: operationId(method, p),
    responses: {
      200: response('موفق'),
      400: response('درخواست نامعتبر'),
      401: response('نیازمند ورود'),
      403: response('دسترسی غیرمجاز'),
      404: response('یافت نشد'),
      409: response('تعارض وضعیت'),
      429: response('تعداد درخواست بیش از حد'),
      500: response('خطای داخلی سرور'),
    },
  };
  const parameters = paramsFor(p);
  if (parameters.length) op.parameters = parameters;
  if (['post', 'put', 'patch'].includes(method)) {
    op.requestBody = {
      required: false,
      content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
    };
  }
  if (!publicRoutes.has(key)) op.security = [{ bearerAuth: [] }];
  paths[p][method] = op;
}

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'GhelGheli API',
    version: '1.0.0',
    description: 'قرارداد کامل HTTP API. این فایل از routeهای Express تولید می‌شود؛ Socket.IO در OpenAPI پوشش داده نمی‌شود.',
  },
  servers: [
    { url: 'https://api.ghelghelishop.ir', description: 'Production' },
    { url: 'http://localhost:4000', description: 'Development' },
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      JsonResponse: { type: 'object', additionalProperties: true },
      Error: {
        type: 'object', required: ['message'],
        properties: { message: { type: 'string' } }, additionalProperties: true,
      },
    },
  },
};

const out = YAML.stringify(doc, { lineWidth: 0 });
const target = path.join(root, 'docs', 'openapi.yaml');
if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== out) {
    console.error('openapi.yaml با routeهای سرور همگام نیست؛ npm run openapi:generate را اجرا کنید');
    process.exit(1);
  }
  console.log(`✓ OpenAPI همگام است: ${routes.length} عملیات HTTP`);
} else {
  fs.writeFileSync(target, out);
  console.log(`OpenAPI generated: ${routes.length} operations, ${Object.keys(paths).length} paths`);
}
