/**
 * One Euro filter, written from Casiez, Roussel and Vogel, "1 Euro Filter: A Simple
 * Speed-based Low-pass Filter for Noisy Input in Interactive Systems", CHI 2012.
 * Low cutoff when the signal is slow (removes jitter), higher cutoff when it moves fast
 * (removes lag).
 */
export class OneEuro {
    minCutoff;
    beta;
    dCutoff;
    xPrev = null;
    dxPrev = 0;
    tPrev = null;
    constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
    }
    static alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }
    /** x is the new sample, t its time in seconds. */
    filter(x, t) {
        if (this.xPrev === null || this.tPrev === null || t <= this.tPrev) {
            this.xPrev = x;
            this.tPrev = t;
            return x;
        }
        const dt = t - this.tPrev;
        const dx = (x - this.xPrev) / dt;
        const aD = OneEuro.alpha(this.dCutoff, dt);
        const dxHat = aD * dx + (1 - aD) * this.dxPrev;
        const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
        const a = OneEuro.alpha(cutoff, dt);
        const xHat = a * x + (1 - a) * this.xPrev;
        this.xPrev = xHat;
        this.dxPrev = dxHat;
        this.tPrev = t;
        return xHat;
    }
    reset() {
        this.xPrev = null;
        this.tPrev = null;
        this.dxPrev = 0;
    }
}
/** One filter per coordinate of a landmark set. */
export class LandmarkSmoother {
    minCutoff;
    beta;
    filters = [];
    constructor(minCutoff = 1.5, beta = 0.02) {
        this.minCutoff = minCutoff;
        this.beta = beta;
    }
    smooth(points, t) {
        if (this.filters.length !== points.length * 2) {
            this.filters = Array.from({ length: points.length * 2 }, () => new OneEuro(this.minCutoff, this.beta));
        }
        return points.map((p, i) => ({ x: this.filters[2 * i].filter(p.x, t), y: this.filters[2 * i + 1].filter(p.y, t) }));
    }
    reset() {
        this.filters.forEach((f) => f.reset());
    }
}
