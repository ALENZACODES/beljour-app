/**
 * A light, for fun read of the expression in a photo, from MediaPipe blendshapes
 * (52 named face movements, each 0..1). It describes the photo, not the person, and
 * never claims to know mood, personality, health or anything about who someone is.
 * Face-mapping credits (licences.json "concepts"): runtime MediaPipe Face Landmarker
 * blendshapes (Bucket A); concept only, no code copied: OpenFace (reading named facial
 * movements rather than labelling the person), from its documentation.
 * Author: John Khan.
 */
const avg = (b, ...names) => names.reduce((s, n) => s + (b[n] ?? 0), 0) / names.length;
const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
export function readExpression(b) {
    const smile = avg(b, "mouthSmileLeft", "mouthSmileRight");
    const smileAsym = Math.abs((b.mouthSmileLeft ?? 0) - (b.mouthSmileRight ?? 0));
    const cheek = avg(b, "cheekSquintLeft", "cheekSquintRight");
    const squint = avg(b, "eyeSquintLeft", "eyeSquintRight");
    const browUp = Math.max(b.browInnerUp ?? 0, avg(b, "browOuterUpLeft", "browOuterUpRight"));
    const frown = avg(b, "browDownLeft", "browDownRight");
    const jaw = b.jawOpen ?? 0;
    const press = avg(b, "mouthPressLeft", "mouthPressRight");
    const wide = avg(b, "eyeWideLeft", "eyeWideRight");
    const cues = [
        { name: "Smile", value: pct(smile) },
        { name: "Cheeks lifted", value: pct(cheek) },
        { name: "Brows raised", value: pct(browUp) },
        { name: "Brows lowered", value: pct(frown) },
        { name: "Mouth open", value: pct(jaw) },
        { name: "Eyes wide", value: pct(wide) },
    ];
    // Each impression is a simple weighted rule, explained in words next to it.
    const approachable = 0.65 * smile + 0.25 * cheek + 0.1 * (1 - frown);
    const confident = 0.45 * (1 - browUp) + 0.3 * (1 - frown) + 0.25 * Math.min(1, smile * 1.6) - 0.2 * jaw;
    const composed = 0.4 * (1 - jaw) + 0.3 * (1 - smileAsym * 2) + 0.3 * (1 - Math.abs(smile - 0.35) * 2) - 0.2 * press;
    const impressions = [
        { label: "Approachable", score: pct(approachable), why: "mostly from how much you're smiling and whether your cheeks lift with it" },
        { label: "Confident", score: pct(confident), why: "level brows that aren't pulled up or down, and a relaxed mouth" },
        { label: "Polished", score: pct(composed), why: "a closed mouth and an even, moderate smile" },
    ].sort((x, y) => y.score - x.score);
    const smileType = smile < 0.25 ? "none" : cheek + squint * 0.5 > 0.35 ? "full (eyes and mouth)" : "mouth only";
    return { cues, impressions, smileType };
}
//# sourceMappingURL=expression.js.map