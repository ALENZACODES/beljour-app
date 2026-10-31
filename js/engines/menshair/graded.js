export const FADE_SHAPES = ["classic", "skin", "drop", "burst", "temple", "shadow"];
const START = { low: .80, mid: .62, high: .43 };
function ease(low, high, x) {
    const t = Math.max(0, Math.min(1, (x - low) / (high - low)));
    return t * t * (3 - 2 * t);
}
function sideGate(u, shape) {
    const side = ease(.34, .94, Math.abs(u));
    if (shape === "temple") {
        const temple = 1 - ease(.08, .48, Math.abs(Math.abs(u) - .94));
        return Math.max(0, Math.min(1, side * (.35 + .65 * temple)));
    }
    if (shape === "burst") {
        const arc = 1 - ease(.12, .65, Math.abs(Math.abs(u) - 1.04));
        return Math.max(0, Math.min(1, side * (.28 + .72 * arc)));
    }
    return side;
}
export function validateGraded(p) {
    if (!Object.hasOwn(START, p.fade) || !FADE_SHAPES.includes(p.fade_shape ?? "classic")) {
        throw Error("Unsupported fade height or transition shape.");
    }
    const side = p.side_grade ?? 1, top = p.top_grade ?? 4, band = p.blend_width ?? 45;
    if (!Number.isInteger(side) || !Number.isInteger(top) || side < 0 || side >= top || top > 4) {
        throw Error("Grades must progress from shorter sides toward a longer top.");
    }
    if (!Number.isInteger(band) || band < 1 || band > 100)
        throw Error("Invalid fade band width.");
    if (p.fade_shape === "skin" && side !== 0)
        throw Error("Skin fade requires side grade zero.");
}
export function gradedField(width, height, anchors, p) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 8 || height < 8 ||
        width * height > 24_000_000)
        throw Error("Graded hair geometry exceeds safe dimensions.");
    validateGraded(p);
    const head = (anchors.left_temple[0] + anchors.right_temple[0]) / 2;
    const half = Math.max((anchors.right_temple[0] - anchors.left_temple[0]) / 2, .01);
    const ear = (anchors.left_ear[1] + anchors.right_ear[1]) / 2;
    const span = Math.max(ear - anchors.crown[1], .01);
    const shape = p.fade_shape ?? "classic", sideGrade = p.side_grade ?? 1, topGrade = p.top_grade ?? 4, band = p.blend_width ?? 45;
    const n = width * height;
    const result = {
        grade: new Float64Array(n), blend: new Float64Array(n),
        side: new Float64Array(n), transition: new Float64Array(n),
    };
    for (let y = 0; y < height; y += 1) {
        const v = ((y + .5) / height - anchors.crown[1]) / span;
        for (let x = 0; x < width; x += 1) {
            const i = y * width + x;
            const u = ((x + .5) / width - head) / half;
            let start = START[p.fade];
            if (shape === "drop")
                start += .13 * (1 - ease(.28, .93, Math.abs(u)));
            else if (shape === "burst")
                start -= .07;
            else if (shape === "temple")
                start += .045;
            else if (shape === "shadow")
                start += .10;
            const bw = .065 + .0016 * band;
            const progress = ease(start - bw, start + bw, v);
            const gate = sideGate(u, shape);
            result.grade[i] = topGrade + (sideGrade - topGrade) * progress;
            result.blend[i] = progress * gate;
            result.side[i] = gate;
            result.transition[i] = 4 * progress * (1 - progress) * gate;
        }
    }
    return result;
}
export function fadeGradeMap(width, height, anchors, p) {
    return gradedField(width, height, anchors, p).grade;
}
export function gradeDiagnostics(field, width) {
    if (!Number.isSafeInteger(width) || width < 1 || field.grade.length % width !== 0) {
        throw Error("Invalid grade diagnostic dimensions.");
    }
    let min = Infinity, max = -Infinity, blend = 0, transition = 0, monotone = true;
    for (let i = 0; i < field.grade.length; i += 1) {
        const grade = field.grade[i];
        min = Math.min(min, grade);
        max = Math.max(max, grade);
        blend += field.blend[i];
        transition += field.transition[i];
        if (i >= width && grade > field.grade[i - width] + 1e-12)
            monotone = false;
    }
    return { grade_min: min, grade_max: max, bottom_is_shorter: monotone,
        blend_coverage: blend / field.grade.length, transition_coverage: transition / field.grade.length };
}
