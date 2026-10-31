/**
 * Choosing which frames of a reel to send to YouCam. Each one costs a unit, so we pick a
 * few that cover the clip: the first face frame of every scene, then the frames whose head
 * pose differs most from the ones already picked (farthest point sampling).
 */
export function histDistance(a, b) {
    let d = 0;
    for (let i = 0; i < a.length; i++)
        d += Math.abs(a[i] - b[i]);
    return d / 2; // 0 = identical, 1 = no overlap
}
export function lumaHistogram(rgba, bins = 32) {
    const h = new Array(bins).fill(0);
    let n = 0;
    for (let i = 0; i < rgba.length; i += 4) {
        const y = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
        h[Math.min(bins - 1, Math.floor((y / 256) * bins))]++;
        n++;
    }
    return h.map((v) => v / (n || 1));
}
/** Head pose from face mesh points: yaw and pitch as shares of face size, roll in degrees. */
export function poseFromMesh(p, aspect) {
    const w = Math.abs(p[454].x - p[234].x) || 1e-6;
    const yaw = (p[1].x - (p[234].x + p[454].x) / 2) / w;
    const eyeY = (p[33].y + p[263].y) / 2;
    const pitch = (p[1].y - eyeY) / ((p[152].y - eyeY) || 1e-6) - 0.45;
    const roll = (Math.atan2((p[263].y - p[33].y), (p[263].x - p[33].x) * aspect) * 180) / Math.PI;
    return [yaw, pitch, roll];
}
export function sceneCuts(frames, threshold = 0.35) {
    const cuts = [];
    for (let i = 1; i < frames.length; i++)
        if (histDistance(frames[i].hist, frames[i - 1].hist) > threshold)
            cuts.push(i);
    return cuts;
}
const poseDist = (a, b) => Math.hypot((a[0] - b[0]) / 0.15, (a[1] - b[1]) / 0.15, (a[2] - b[2]) / 10);
export function selectKeyframes(frames, max, cutThreshold = 0.35) {
    const withFace = frames.map((f, i) => (f.pose ? i : -1)).filter((i) => i >= 0);
    if (!withFace.length || max < 1)
        return [];
    const picked = new Set([withFace[0]]);
    for (const c of sceneCuts(frames, cutThreshold)) {
        const next = withFace.find((i) => i >= c);
        if (next !== undefined && picked.size < max)
            picked.add(next);
    }
    while (picked.size < Math.min(max, withFace.length)) {
        let best = -1, bestD = -1;
        for (const i of withFace) {
            if (picked.has(i))
                continue;
            const d = Math.min(...[...picked].map((j) => poseDist(frames[i].pose, frames[j].pose)));
            if (d > bestD) {
                bestD = d;
                best = i;
            }
        }
        if (best < 0 || bestD < 0.5)
            break; // remaining frames look like ones we already have
        picked.add(best);
    }
    return [...picked].sort((a, b) => a - b);
}
/**
 * Weights of each keyframe for a frame at time t: linear between the keyframes either side,
 * never across a scene cut (cut times in seconds).
 */
export function blendWeights(t, keyTimes, cutTimes) {
    const w = new Array(keyTimes.length).fill(0);
    if (!keyTimes.length)
        return w;
    const scene = (x) => cutTimes.filter((c) => c <= x).length;
    const s = scene(t);
    const same = keyTimes.map((k, i) => ({ k, i })).filter(({ k }) => scene(k) === s);
    const pool = same.length ? same : keyTimes.map((k, i) => ({ k, i }));
    const before = pool.filter(({ k }) => k <= t).pop();
    const after = pool.find(({ k }) => k > t);
    if (before && after) {
        const f = (t - before.k) / (after.k - before.k);
        w[before.i] = 1 - f;
        w[after.i] = f;
    }
    else {
        const only = (before ?? after);
        w[only.i] = 1;
    }
    return w;
}
