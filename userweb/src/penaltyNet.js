// 15×9 mass-spring goal net, ported numerically from Android's penalty_net.dart.
// Flat Float32Arrays keep the hot loop allocation-free and the simulator
// sleeps after the visible wave settles.
export default class PenaltyNet {
  static cols = 15;
  static rows = 9;

  constructor() {
    this.n = PenaltyNet.cols * PenaltyNet.rows;
    for (const key of ['dx', 'dy', 'dz', 'vx', 'vy', 'vz', 'px', 'py', 'pz']) {
      this[key] = new Float32Array(this.n);
    }
    this.settled = true;
  }

  reset() {
    for (const key of ['dx', 'dy', 'dz', 'vx', 'vy', 'vz', 'px', 'py', 'pz']) {
      this[key].fill(0);
    }
    this.settled = true;
  }

  pinned(c, r) {
    return c === 0 || c === PenaltyNet.cols - 1 || r === 0;
  }

  hit(u, v, power) {
    const radius = 0.16 + power * 0.10;
    const amp = (0.55 + power * 0.85) * 5;
    const inv2r2 = 1 / (2 * radius * radius);
    for (let r = 0; r < PenaltyNet.rows; r++) {
      for (let c = 0; c < PenaltyNet.cols; c++) {
        if (this.pinned(c, r)) continue;
        const i = r * PenaltyNet.cols + c;
        const du = c / (PenaltyNet.cols - 1) - u;
        const dv = r / (PenaltyNet.rows - 1) - v;
        const g = Math.exp(-(du * du + dv * dv) * inv2r2);
        if (g < 0.01) continue;
        this.vz[i] += amp * g;
        this.vx[i] -= du * amp * g * 0.55;
        this.vy[i] -= dv * amp * g * 0.55;
      }
    }
    this.settled = false;
  }

  step(dt) {
    if (this.settled) return false;
    const steps = Math.min(3, Math.max(1, Math.round(dt / 0.016)));
    const h = 1 / 60;
    const kNeighbour = 190;
    const kRest = 26;
    const damp = 4.6;
    let energy = 0;
    for (let s = 0; s < steps; s++) {
      this.px.set(this.dx); this.py.set(this.dy); this.pz.set(this.dz);
      energy = 0;
      for (let r = 0; r < PenaltyNet.rows; r++) {
        for (let c = 0; c < PenaltyNet.cols; c++) {
          if (this.pinned(c, r)) continue;
          const i = r * PenaltyNet.cols + c;
          let fx = -kRest * this.px[i];
          let fy = -kRest * this.py[i];
          let fz = -kRest * this.pz[i];
          if (c > 0) {
            const j = i - 1;
            fx += kNeighbour * (this.px[j] - this.px[i]);
            fy += kNeighbour * (this.py[j] - this.py[i]);
            fz += kNeighbour * (this.pz[j] - this.pz[i]);
          }
          if (c < PenaltyNet.cols - 1) {
            const j = i + 1;
            fx += kNeighbour * (this.px[j] - this.px[i]);
            fy += kNeighbour * (this.py[j] - this.py[i]);
            fz += kNeighbour * (this.pz[j] - this.pz[i]);
          }
          if (r > 0) {
            const j = i - PenaltyNet.cols;
            fx += kNeighbour * (this.px[j] - this.px[i]);
            fy += kNeighbour * (this.py[j] - this.py[i]);
            fz += kNeighbour * (this.pz[j] - this.pz[i]);
          }
          if (r < PenaltyNet.rows - 1) {
            const j = i + PenaltyNet.cols;
            fx += kNeighbour * (this.px[j] - this.px[i]);
            fy += kNeighbour * (this.py[j] - this.py[i]);
            fz += kNeighbour * (this.pz[j] - this.pz[i]);
          }
          fx -= damp * this.vx[i];
          fy -= damp * this.vy[i];
          fz -= damp * this.vz[i];
          fy += 0.35;
          this.vx[i] += fx * h; this.vy[i] += fy * h; this.vz[i] += fz * h;
          this.dx[i] += this.vx[i] * h;
          this.dy[i] += this.vy[i] * h;
          this.dz[i] += this.vz[i] * h;
          energy += Math.abs(this.vx[i]) + Math.abs(this.vy[i]) + Math.abs(this.vz[i]);
        }
      }
    }
    if (energy < 1.75) this.reset();
    return true;
  }

  offX(c, r, goalW) {
    return this.dx[r * PenaltyNet.cols + c] * goalW * 0.09;
  }

  offY(c, r, goalH) {
    const i = r * PenaltyNet.cols + c;
    return (this.dy[i] + this.dz[i] * 0.45) * goalH * 0.30;
  }

  depth(c, r) {
    return this.dz[r * PenaltyNet.cols + c];
  }
}
