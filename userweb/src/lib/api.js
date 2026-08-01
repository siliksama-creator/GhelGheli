// Shared HTTP layer for the user web app.
//
// Extracted from main.jsx so every screen speaks to the backend the same way
// and error handling lives in exactly one place.
export const API =
  import.meta.env.VITE_API_BASE || 'https://api.ghelghelishop.ir';

/**
 * One request. Throws an Error carrying `.status` and `.data` so callers can
 * branch on the HTTP code (a 409 from the tap endpoint is an answer, not a
 * network failure) instead of parsing message strings.
 */
export async function req(path, method = 'GET', body, token) {
  let r;
  try {
    r = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    // fetch() only rejects on a genuine network fault. Give that its own
    // message — "خطا در ارتباط با سرور" for a 500 and for an offline phone
    // sent users chasing the wrong problem.
    const err = new Error('اتصال اینترنت برقرار نیست');
    err.status = 0;
    err.offline = true;
    throw err;
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.message || 'خطا در ارتباط با سرور');
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Absolute URL for an asset path returned by the API. */
export const asset = v =>
  !v ? '' : String(v).startsWith('http') ? v : API + v;

/** Persian digits, used everywhere numbers are shown. */
export const fa = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

/**
 * URL for a stored avatar key.
 *
 * The database stores keys like `avatar_1_football.png` and the server
 * validates against that exact list, so the KEY must stay .png. The files
 * themselves are now WebP (the PNGs were 384px and 240KB each, displayed at
 * 62px — 3.6MB of avatars on a screen that shows ten of them). Mapping the
 * extension here means no migration and no server change.
 */
export const avatarUrl = key =>
  `/avatars/${String(key || avatars[0]).replace(/\.png$/, '.webp')}`;

export const avatars = [
  'avatar_1_football.png', 'avatar_2_trophy.png', 'avatar_3_star.png',
  'avatar_4_rocket.png', 'avatar_5_lion.png', 'avatar_6_tiger.png',
  'avatar_7_eagle.png', 'avatar_8_target.png', 'avatar_9_bolt.png',
  'avatar_10_crown.png',
];

/** Accent palette for the admin-pinned announcement. Mirrors the server's
 *  PIN_ACCENTS and the Flutter pinAccents map. */
export const PIN_COLORS = {
  gold: '#FFC53D', green: '#34D399', blue: '#60A5FA', red: '#F87171',
};
