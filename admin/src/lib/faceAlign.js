// هم‌ترازیِ چهره برای SFace — پورت getSimilarityTransformMatrix از
// cv::FaceRecognizerSF (modules/objdetect/src/face_recognize.cpp).
// نقاط مقصد (ArcFace/SFace) برای تصویر 112x112.
const DST = [
  [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
  [41.5493, 92.3655], [70.7299, 92.2041],
];
const DST_MEAN = [56.0262, 71.9008];

// بخش چرخشیِ نزدیک‌ترین متعامدِ 2x2 (procrustes) و مجموع مقادیر منفرد.
// از معادلهٔ R(A^T A)=√(A^T A) استفاده می‌کنیم؛ برای 2x2 فرم بستهٔ پایدار.
function svd2(A) {
  const [a, b, c, d] = A;
  const E = a * a + b * b + c * c + d * d;
  const det = a * d - b * c;
  const disc = Math.sqrt(Math.max(0, E * E - 4 * det * det));
  const s1 = Math.sqrt((E + disc) / 2);
  const s2 = Math.sqrt(Math.max(0, (E - disc) / 2));
  // متقارنِ S = A^T A:
  // S00=a²+c², S01=ab+cd, S11=b²+d². نزدیک‌ترین چرخش R با زاویهٔ نصفِ زاویهٔ S.
  const theta = 0.5 * Math.atan2(2 * (a * b + c * d), a * a + c * c - (b * b + d * d));
  // R = A · V · diag(1/s) ... به‌جای آن مستقیم زاویهٔ خود A:
  // زاویهٔ قطبشِ A برابرِ زاویهٔ میانگین جهت‌های ستون‌ها:
  const phi = Math.atan2(c - b, a + d);   // زاویهٔ نزدیک‌ترین چرخش
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const R = [cp, -sp, sp, cp];
  void theta;
  return { s: [s1, s2], R };
}

// ماتریس شباهت 2x3 برای نگاشت ۵ نقطهٔ ورودی به DST.
function similarityTransform(src) {
  const srcMean = [0, 0];
  for (const p of src) { srcMean[0] += p[0]; srcMean[1] += p[1]; }
  srcMean[0] /= 5; srcMean[1] /= 5;
  const sdm = src.map(p => [p[0] - srcMean[0], p[1] - srcMean[1]]);
  const ddm = DST.map(p => [p[0] - DST_MEAN[0], p[1] - DST_MEAN[1]]);
  let A00 = 0, A01 = 0, A10 = 0, A11 = 0;
  for (let i = 0; i < 5; i++) {
    A00 += ddm[i][0] * sdm[i][0];
    A01 += ddm[i][0] * sdm[i][1];
    A10 += ddm[i][1] * sdm[i][0];
    A11 += ddm[i][1] * sdm[i][1];
  }
  A00 /= 5; A01 /= 5; A10 /= 5; A11 /= 5;
  const detA = A00 * A11 - A01 * A10;
  const detSign = detA < 0 ? -1 : 1;
  const { s, R } = svd2([A00, A01, A10, A11]);
  // R = U·Vt (بخش چرخشی). برای det<0 ستون دوم R علامت می‌شود.
  if (detSign < 0) { R[1] = -R[1]; R[3] = -R[3]; }
  void detA;
  let var1 = 0, var2 = 0;
  for (const p of sdm) { var1 += p[0] * p[0]; var2 += p[1] * p[1]; }
  const srcVar = (var1 + var2) / 5;
  const scale = (s[0] + detSign * s[1]) / srcVar;
  let T00 = R[0], T01 = R[1], T10 = R[2], T11 = R[3];
  const ts0 = T00 * srcMean[0] + T01 * srcMean[1];
  const ts1 = T10 * srcMean[0] + T11 * srcMean[1];
  const T02 = DST_MEAN[0] - scale * ts0;
  const T12 = DST_MEAN[1] - scale * ts1;
  return [T00 * scale, T01 * scale, T02, T10 * scale, T11 * scale, T12];
}

export { similarityTransform };
