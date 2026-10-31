export const SUBJECT_LIMIT = 20;
const SUBJECT_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/;
export function subjectBoxProblem(box) {
    if (!SUBJECT_ID.test(box.id))
        return "invalid subject identifier";
    if (box.origin !== "drawn" && box.origin !== "detected")
        return "unknown subject origin";
    const values = [box.x, box.y, box.width, box.height];
    if (values.some((value) => !Number.isFinite(value)))
        return "non-finite subject bounds";
    if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) {
        return "subject bounds must have positive size";
    }
    if (box.x + box.width > 1 + 1e-9 || box.y + box.height > 1 + 1e-9) {
        return "subject bounds must be inside the preview";
    }
    if (box.width < 0.015 || box.height < 0.015)
        return "subject box is too small";
    if (box.primary !== undefined && typeof box.primary !== "boolean")
        return "invalid primary flag";
    return null;
}
/** Reject a whole inconsistent result instead of quietly dropping a bystander. */
export function checkedSubjectBoxes(boxes) {
    if (!Array.isArray(boxes) || boxes.length > SUBJECT_LIMIT) {
        throw new RangeError("Subject list exceeds the supported preview count");
    }
    const ids = new Set();
    let primaryCount = 0;
    const out = [];
    for (const box of boxes) {
        const problem = subjectBoxProblem(box);
        if (problem)
            throw new RangeError(problem);
        if (ids.has(box.id))
            throw new RangeError("Duplicate subject identifier");
        ids.add(box.id);
        if (box.primary)
            primaryCount += 1;
        if (primaryCount > 1)
            throw new RangeError("Multiple primary subjects are not supported");
        out.push(Object.freeze({ ...box }));
    }
    return Object.freeze(out);
}
export function subjectArea(box) {
    return box.width * box.height;
}
export function suggestedSubject(boxes) {
    if (!boxes.length)
        return null;
    const declared = boxes.find((box) => box.primary);
    if (declared)
        return declared.id;
    const ranked = [...boxes].sort((left, right) => {
        const leftDist = Math.hypot(left.x + left.width / 2 - 0.5, left.y + left.height / 2 - 0.5);
        const rightDist = Math.hypot(right.x + right.width / 2 - 0.5, right.y + right.height / 2 - 0.5);
        const leftScore = subjectArea(left) / (1 + leftDist);
        const rightScore = subjectArea(right) / (1 + rightDist);
        return rightScore - leftScore || left.id.localeCompare(right.id);
    });
    return ranked[0].id;
}
/** Drawn coordinates are authored placeholders, never image analysis outputs. */
export const DRAWN_PAIR = checkedSubjectBoxes([
    { id: "drawn-main", x: 0.12, y: 0.22, width: 0.37, height: 0.54, origin: "drawn", primary: true },
    { id: "drawn-guest", x: 0.55, y: 0.25, width: 0.33, height: 0.50, origin: "drawn" },
]);
