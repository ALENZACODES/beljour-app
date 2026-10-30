import { MOUTH_LIPS } from "../../data/regions/index.js";
import { checkFace } from "./geometry.js";
import { renderParts, SIMULATION } from "./parts.js";
import { EXPRESSION_TABLE } from "./generated/expressions.js";
export const VERSION = "expressions/1";
export const LABEL = EXPRESSION_TABLE.label;
export const OPEN_MOUTH_RATIO = 0.12; // ASSUMED, as expressions.py
export const GAP_TOLERANCE = 1e-6;
export const EXPRESSIONS = EXPRESSION_TABLE.expressions;
export const REFUSALS = {
    unknown_expression: "That expression is not in this set.",
    mouth_open: "These expressions keep the mouth closed, and the mouth in this photo is open.",
    mouth_opened: "This change would open the mouth, so it was not applied.",
};
export class ExpressionRefusal extends RangeError {
    code;
    constructor(code) {
        super(REFUSALS[code]);
        this.code = code;
        this.name = "ExpressionRefusal";
    }
}
export function lipGap(points) {
    const [a, b] = MOUTH_LIPS;
    return Math.hypot(points[b][0] - points[a][0], points[b][1] - points[a][1]);
}
export function mouthGap(points) {
    const [, , c, d] = MOUTH_LIPS, width = Math.hypot(points[d][0] - points[c][0], points[d][1] - points[c][1]);
    return width > 1e-9 ? lipGap(points) / width : 0;
}
/** The part amounts of an expression at `amount` percent (0..100) of full expression. */
export function valuesFor(expression, amount = 100) {
    const row = EXPRESSIONS.find((e) => e.id === expression);
    if (!row)
        throw new ExpressionRefusal("unknown_expression");
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 100)
        throw new RangeError("expression amount must be 0..100");
    const out = {};
    for (const [name, v] of Object.entries(row.values))
        out[name] = v * amount / 100;
    return out;
}
export function renderExpression(image, face, expression, { amount = 100, strength = 1 } = {}) {
    checkFace(face);
    const values = valuesFor(expression, amount);
    const ratio = mouthGap(face);
    if (ratio > OPEN_MOUTH_RATIO)
        throw new ExpressionRefusal("mouth_open");
    const out = renderParts(image, face, values, { strength, optedIn: true });
    const before = lipGap(face), after = lipGap(out.targets);
    if (after > before + GAP_TOLERANCE)
        throw new ExpressionRefusal("mouth_opened");
    return { image: out.image, targets: out.targets, expression, values,
        metrics: { ...out.metrics, expression, amount, mouthGapRatio: ratio, lipGapBefore: before, lipGapAfter: after },
        labels: [SIMULATION, LABEL] };
}
export function catalogue(feature) {
    return EXPRESSIONS.filter((e) => feature === undefined || e.feature === feature);
}
//# sourceMappingURL=expressions.js.map