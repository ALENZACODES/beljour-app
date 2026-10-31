import { CONTOURS } from "../../data/regions/generated/topology.js";
import { regionMask } from "../../data/regions/index.js";
import { symmetricFace } from "./face-synthetic.js";
import { facePhoto } from "./beard.js";
const W = 272, H = 336, FACE_W = 168, FACE_L = 218;
/** Small seeded generator so every drawing is the same on every device. */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function personOf(face, width, height) {
    return regionMask("face_oval", face, width, height, { normalized: false, supersample: 2 });
}
/** ID-style framing: a smaller head low in a tall frame, plain backdrop, clear space above. */
export function headroomPortrait() {
    const width = 272, height = 408, faceW = 150, faceL = 194, drop = 28;
    const face = symmetricFace(width, height, faceW, faceL).map(([x, y]) => [x, y + drop]);
    const image = facePhoto(face, width, height, 7);
    // An even, pale backdrop, as an ID photo asks for: every pixel still showing the drawn
    // gradient (exactly the values facePhoto paints behind the person) turns flat.
    const person = personOf(face, width, height);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3;
            const bg = [150 + 30 * y / height, 170 + 20 * x / width, 190 - 20 * y / height];
            if (bg.some((v, c) => Math.abs(image.data[i + c] - v) > 0.6))
                continue;
            image.data[i] = 226;
            image.data[i + 1] = 230;
            image.data[i + 2] = 234;
        }
    return { image, face, person };
}
/** A drawn portrait framed by coily hair: tight rings packed around the head, outside the face. */
export function coilyPortrait() {
    const face = symmetricFace(W, H, FACE_W, FACE_L);
    const image = facePhoto(face, W, H, 9);
    const person = personOf(face, W, H);
    const cx = W / 2, top = (H - FACE_L) / 2, cy = top + 0.42 * FACE_L, rx = FACE_W * 0.78, ry = FACE_L * 0.62;
    const stop = top + 0.74 * FACE_L, rand = seeded(11);
    // Coil centres on a jittered grid; each is a ring a few pixels across.
    const coils = [];
    for (let y = 0; y < stop + 8; y += 6)
        for (let x = 0; x < W; x += 6)
            coils.push([x + rand() * 5, y + rand() * 5, 2.2 + rand() * 1.6]);
    const hair = new Float32Array(W * H);
    for (let y = 0; y < Math.min(H, stop + 10); y++)
        for (let x = 0; x < W; x++) {
            const p = y * W + x, a = Math.atan2(y - cy, x - cx);
            // A soft, bumpy outline, as coily hair has, ending in uneven tips near the jaw.
            const edge = 1 + 0.018 * Math.sin(a * 17) + 0.012 * Math.sin(a * 37 + 1.3) + 0.008 * Math.sin(a * 61 + 0.4);
            const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
            if (d > edge || person.data[p] > 0.5 || y > stop + 6 * Math.sin(x * 0.45) + 4 * Math.sin(x * 0.13 + 2))
                continue;
            hair[p] = 1;
        }
    for (let p = 0; p < W * H; p++) {
        if (!hair[p])
            continue;
        const x = p % W, y = Math.floor(p / W);
        let ring = 0;
        for (const [qx, qy, r] of coils) {
            if (Math.abs(qx - x) > 5 || Math.abs(qy - y) > 5)
                continue;
            ring = Math.max(ring, Math.max(0, 1 - Math.abs(Math.hypot(x - qx, y - qy) - r) / 0.9));
        }
        const i = p * 3;
        image.data[i] = Math.round(34 + 58 * ring);
        image.data[i + 1] = Math.round(23 + 40 * ring);
        image.data[i + 2] = Math.round(18 + 28 * ring);
    }
    return { image, face, person, hair: { width: W, height: H, channels: 1, data: hair } };
}
/** A drawn smile with the mouth open: lip corners lifted and two rows of teeth showing. */
export function teethPortrait() {
    const face = symmetricFace(W, H, FACE_W, FACE_L);
    const top = (H - FACE_L) / 2, mouthY = top + 0.77 * FACE_L, cx = W / 2, half = 1.5 * (FACE_W / 5) / 2;
    const lift = (p) => { const t = (p[0] - cx) / half; return [p[0], p[1] - 5 * t * t]; };
    for (const idx of CONTOURS.lips_inner) {
        const [x, y] = face[idx];
        face[idx] = lift([x, mouthY + (y - mouthY) * 6.5]);
    }
    for (const idx of CONTOURS.lips_outer) {
        const [x, y] = face[idx];
        face[idx] = lift([x, mouthY + (y - mouthY) * 1.35]);
    }
    const image = facePhoto(face, W, H, 13);
    const opening = regionMask("mouth_opening", face, W, H, { normalized: false });
    let minY = H, maxY = 0;
    for (let p = 0; p < W * H; p++)
        if (opening.data[p] > 0.5) {
            const y = Math.floor(p / W);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    const gap = (minY + maxY) / 2, toothW = half / 3.2;
    for (let p = 0; p < W * H; p++) {
        const m = opening.data[p];
        if (m <= 0)
            continue;
        const x = p % W, y = Math.floor(p / W), i = p * 3;
        // Slightly warm teeth (so whitening has something to show), thin seams between them, a dark
        // line where the rows meet.
        const seam = Math.abs(((x - cx) / toothW) - Math.round((x - cx) / toothW)) < 0.08 ? 0.82 : 1;
        const bite = Math.abs(y - gap) < 0.8 ? 0.45 : 1;
        const tone = [232, 222, 196].map((c) => c * seam * bite);
        for (let c = 0; c < 3; c++)
            image.data[i + c] = Math.round(image.data[i + c] * (1 - m) + tone[c] * m);
    }
    return { image, face, person: personOf(face, W, H) };
}
