/** Blind judging session: reads a judge bundle (written by api/plumb_api/arena/pairs.py) and
 * records one judgement per assignment in the exact format the Python side validates
 * (judging.py "beljour-judgement/1"). The page never learns who made A or B: the bundle has
 * random file names and no producer, and the sealed key stays on the box.
 * A judge picks the better side, one loser reason, and may add 1-10 scores. Still Her is asked
 * only on photos labelled as women and only when the judge says she is a woman.
 * Author: John Khan.
 */
import { JUDGE_DIMENSIONS, REASONS } from "./reasons.js";
export const BUNDLE_FORMAT = "beljour-judge-bundle/1";
export const JUDGEMENT_FORMAT = "beljour-judgement/1";
export class BundleError extends Error {
}
const ID = /^[0-9a-f]{12}$/;
const IMG = /^images\/[0-9a-f]{16}\.png$/;
export function readBundle(raw) {
    const b = raw;
    if (!b || b.format !== BUNDLE_FORMAT)
        throw new BundleError("This isn't a judge bundle (manifest.json from the arena).");
    if (typeof b.run !== "string" || typeof b.bundle !== "string" || typeof b.question !== "string")
        throw new BundleError("The bundle is missing its run or question.");
    if (!Array.isArray(b.reasons) || b.reasons.length !== REASONS.length || b.reasons.some((r, i) => r !== REASONS[i])) {
        throw new BundleError("The bundle's loser reasons don't match this page. Update the page or the bundle.");
    }
    if (!Array.isArray(b.assignments) || !b.assignments.length)
        throw new BundleError("The bundle has nothing to judge.");
    const seen = new Set();
    for (const a of b.assignments) {
        if (!a || !ID.test(a.id) || seen.has(a.id))
            throw new BundleError("An assignment id is missing or repeated.");
        seen.add(a.id);
        if (![a.ref, a.a, a.b].every((p) => typeof p === "string" && IMG.test(p)))
            throw new BundleError("An image path isn't a random bundle name.");
        if (typeof a.label !== "string" || typeof a.filter !== "string" || typeof a.still_her !== "boolean")
            throw new BundleError("An assignment is incomplete.");
    }
    return b;
}
export class SessionError extends Error {
}
function cleanScores(side, stillHerAllowed) {
    if (!side)
        return undefined;
    const out = {};
    for (const [dim, value] of Object.entries(side)) {
        if (!JUDGE_DIMENSIONS.includes(dim))
            throw new SessionError(`${dim} isn't scored per image`);
        if (dim === "still_her" && !stillHerAllowed)
            continue;
        if (!Number.isInteger(value) || value < 1 || value > 10)
            throw new SessionError("Scores are whole numbers from 1 to 10");
        out[dim] = value;
    }
    return Object.keys(out).length ? out : undefined;
}
export class JudgingSession {
    bundle;
    judge;
    womanJudge;
    clock;
    answers = new Map();
    order = [];
    constructor(bundle, judge, womanJudge, clock = () => new Date()) {
        this.bundle = bundle;
        this.judge = judge;
        this.womanJudge = womanJudge;
        this.clock = clock;
        if (!/^[\w.@-]{2,40}$/.test(judge))
            throw new SessionError("Use a judge name of 2-40 letters, numbers, dots or dashes");
    }
    get total() { return this.bundle.assignments.length; }
    get done() { return this.answers.size; }
    get finished() { return this.done === this.total; }
    /** The next unanswered assignment, in bundle order. */
    current() { return this.bundle.assignments.find((a) => !this.answers.has(a.id)) ?? null; }
    stillHerAsked(a) { return a.still_her && this.womanJudge; }
    answer(answer) {
        const a = this.current();
        if (!a)
            throw new SessionError("Everything in this bundle is judged");
        if (answer.winner !== "A" && answer.winner !== "B")
            throw new SessionError("Pick A or B");
        if (!REASONS.includes(answer.reason))
            throw new SessionError("Pick one reason the other side lost");
        const allowed = this.stillHerAsked(a);
        const scores = {};
        const sa = cleanScores(answer.scores?.A, allowed), sb = cleanScores(answer.scores?.B, allowed);
        if (sa)
            scores.A = sa;
        if (sb)
            scores.B = sb;
        const record = { format: JUDGEMENT_FORMAT, assignment: a.id, judge: this.judge, kind: "human",
            winner: answer.winner, reason: answer.reason, scores, woman_judge: this.womanJudge, at: this.clock().toISOString() };
        this.answers.set(a.id, record);
        this.order.push(a.id);
        return record;
    }
    /** Take back the last answer. */
    undo() {
        const last = this.order.pop();
        if (!last)
            return null;
        this.answers.delete(last);
        return this.bundle.assignments.find((x) => x.id === last) ?? null;
    }
    records() { return this.order.map((id) => this.answers.get(id)); }
    toJsonl() { return this.records().map((r) => JSON.stringify(r)).join("\n") + (this.done ? "\n" : ""); }
    fileName() { return `${this.bundle.run}-${this.bundle.bundle}-${this.judge}.jsonl`; }
    /** Restore answers saved on this device after a reload (same bundle and judge only). */
    restore(lines) {
        let n = 0;
        for (const line of lines.split("\n")) {
            if (!line.trim())
                continue;
            try {
                const rec = JSON.parse(line);
                const a = this.current();
                if (!a || rec.assignment !== a.id || rec.judge !== this.judge)
                    break;
                this.answer({ winner: rec.winner, reason: rec.reason, scores: rec.scores });
                n++;
            }
            catch {
                break;
            }
        }
        return n;
    }
}
/** Keyboard: 1 or A picks A, 2 or B picks B, r1-r9 are reasons by number. */
export function sideForKey(key) {
    const k = key.toLowerCase();
    if (k === "a" || k === "1")
        return "A";
    if (k === "b" || k === "2")
        return "B";
    return null;
}
//# sourceMappingURL=session.js.map