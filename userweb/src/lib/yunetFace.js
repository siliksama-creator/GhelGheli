// پس‌پردازش YuNet — پورتِ مو‌به‌موِ cv::FaceDetectorYN که روی خروجی خام مدل
// (و keypoints) در برابر OpenCV اعتبارسنجی شده است.

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, x2 - x1), ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni <= 0 ? 0 : inter / uni;
}

function nms(faces, th) {
  faces.sort((a, b) => b.score - a.score);
  const keep = [];
  const used = new Array(faces.length).fill(false);
  for (let i = 0; i < faces.length; i++) {
    if (used[i]) continue;
    keep.push(faces[i]);
    for (let j = i + 1; j < faces.length; j++) {
      if (!used[j] && iou(faces[i], faces[j]) > th) used[j] = true;
    }
  }
  return keep;
}

function tensorData(out, name) {
  const t = out[name];
  return t ? t.data : null;
}

/**
 * @param out خروجیِ session.run مدل YuNet (نام‌ها: cls_8/obj_8/bbox_8/kps_8 …)
 * @param inputSize 640
 * @returns چهره‌های {x,y,w,h,kp:[10],score} در فضای ۶۴۰
 */
export function detectFacesFromOutputs(out, inputSize, scoreTh = 0.6, nmsTh = 0.3) {
  const strides = [8, 16, 32];
  const faces = [];
  for (const st of strides) {
    const cls = tensorData(out, `cls_${st}`);
    const obj = tensorData(out, `obj_${st}`);
    const bbox = tensorData(out, `bbox_${st}`);
    const kps = tensorData(out, `kps_${st}`);
    if (!cls || !obj || !bbox || !kps) continue;
    const cols = inputSize / st;
    const rows = inputSize / st;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        let cs = cls[idx]; if (cs > 1) cs = 1; if (cs < 0) cs = 0;
        let os = obj[idx]; if (os > 1) os = 1; if (os < 0) os = 0;
        const score = Math.sqrt(cs * os);
        if (score < scoreTh) continue;
        const cx = (c + bbox[idx * 4 + 0]) * st;
        const cy = (r + bbox[idx * 4 + 1]) * st;
        const w = Math.exp(bbox[idx * 4 + 2]) * st;
        const h = Math.exp(bbox[idx * 4 + 3]) * st;
        const x = cx - w / 2;
        const y = cy - h / 2;
        const kp = [];
        for (let n = 0; n < 5; n++) {
          kp.push((kps[idx * 10 + 2 * n] + c) * st,
                  (kps[idx * 10 + 2 * n + 1] + r) * st);
        }
        faces.push({ x, y, w, h, kp, score });
      }
    }
  }
  return nms(faces, nmsTh);
}
