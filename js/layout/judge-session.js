/** In-memory state for one walkthrough. No persistence and no provider permissions. */
import { parseVisibleStrength } from "./strength-scale.js";
import { EMPTY_JUDGE_DETAILS } from "./judge-five-edits.js";
import { JUDGE_STEPS, judgeIndex, judgeStepAt, } from "./judge-contract.js";
const EMPTY_PERMISSIONS = {
    local: false,
    hair: false,
    face: false,
    mock: false,
};
/** Owner's order (Oct 29): no per-step consent. The single device consent covers the walk, so
 * every illustrative action is simply on; withdrawing local processing still turns them all off. */
const ALL_ON = { local: true, hair: true, face: true, mock: true };
export class JudgeSession {
    step = "source";
    source = null;
    permissions = { ...ALL_ON };
    hair = "none";
    face = "none";
    details = { ...EMPTY_JUDGE_DETAILS };
    mock = false;
    comparison = 50;
    format = "image/png";
    size = "standard";
    strength = 5.0;
    completed = new Set();
    skipped = new Set();
    get snapshot() {
        return {
            step: this.step,
            source: this.source,
            permissions: { ...this.permissions },
            hair: this.hair,
            face: this.face,
            details: { ...this.details },
            mock: this.mock,
            comparison: this.comparison,
            format: this.format,
            size: this.size,
            strength: this.strength,
            complete: [...this.completed],
            skipped: [...this.skipped],
        };
    }
    selectSource(kind) {
        if (kind !== "sample" && kind !== "upload")
            throw new RangeError("Invalid source");
        this.source = kind;
        this.hair = "none";
        this.face = "none";
        this.details = { ...EMPTY_JUDGE_DETAILS };
        this.mock = false;
        this.strength = 5.0;
        this.completed.clear();
        this.skipped.clear();
    }
    clearSource() {
        this.source = null;
        this.hair = "none";
        this.face = "none";
        this.details = { ...EMPTY_JUDGE_DETAILS };
        this.mock = false;
        this.completed.clear();
    }
    consent(action, granted) {
        if (!(action in EMPTY_PERMISSIONS))
            throw new RangeError("Unknown demonstration permission");
        this.permissions = { ...this.permissions, [action]: granted };
        if (action === "local" && !granted) {
            this.permissions = { ...EMPTY_PERMISSIONS };
            this.hair = "none";
            this.face = "none";
            this.details = { ...EMPTY_JUDGE_DETAILS };
            this.mock = false;
            return;
        }
        if (!granted && action === "hair") {
            this.hair = "none";
            this.details = { ...this.details, "hair-highlight": false };
        }
        if (!granted && action === "face") {
            this.face = "none";
            this.details = { ...this.details, "lip-colour": false, eyeliner: false };
        }
        if (!granted && action === "mock")
            this.mock = false;
    }
    setHair(shade) {
        if (!["none", "chestnut", "deep-blue"].includes(shade))
            return false;
        if (!this.source || !this.permissions.local || !this.permissions.hair)
            return false;
        this.hair = shade;
        return true;
    }
    setFace(tone) {
        if (!["none", "warm", "cool"].includes(tone))
            return false;
        if (!this.source || !this.permissions.local || !this.permissions.face)
            return false;
        this.face = tone;
        return true;
    }
    /** Local-only accessory controls; every toggle needs matching action consent. */
    setDetail(detail, enabled) {
        if (!(detail in EMPTY_JUDGE_DETAILS) || typeof enabled !== "boolean")
            return false;
        const scope = detail === "hair-highlight" ? "hair" : "face";
        if (!this.source || !this.permissions.local || !this.permissions[scope])
            return false;
        this.details = { ...this.details, [detail]: enabled };
        return true;
    }
    /** One explicit button can rehearse five distinct drawn effects, never a provider task. */
    applyFiveIllustrations() {
        if (!this.source || !this.permissions.local || !this.permissions.hair || !this.permissions.face) {
            return false;
        }
        this.hair = "chestnut";
        this.face = "warm";
        this.details = { "hair-highlight": true, "lip-colour": true, eyeliner: true };
        return true;
    }
    setMock(enabled) {
        if (!this.source || !this.permissions.local || !this.permissions.mock)
            return false;
        this.mock = enabled;
        return true;
    }
    setStrength(value) {
        try {
            this.strength = parseVisibleStrength(value);
            return true;
        }
        catch {
            return false;
        }
    }
    setComparison(percent) {
        if (!Number.isFinite(percent))
            return;
        this.comparison = Math.max(0, Math.min(100, Math.round(percent)));
    }
    setExport(format, size) {
        if (format !== "image/png" && format !== "image/jpeg")
            return false;
        if (size !== "standard" && size !== "large")
            return false;
        this.format = format;
        this.size = size;
        return true;
    }
    get unmet() {
        if (this.step === "source" && !this.source)
            return "Choose the drawn sample or a local photo.";
        if (this.step === "consent" && !this.permissions.local) {
            return "Confirm local processing to continue, or skip this step.";
        }
        if (this.step === "hair" && this.hair === "none") {
            return "Apply a hair-colour overlay, or skip this step.";
        }
        if (this.step === "face" && this.face === "none") {
            return "Apply a face-colour overlay, or skip this step.";
        }
        if (this.step === "tryon" && !this.mock)
            return "Start the labelled mock try-on, or skip.";
        return null;
    }
    next() {
        if (this.unmet || this.step === "plans")
            return false;
        this.completed.add(this.step);
        this.skipped.delete(this.step);
        this.step = judgeStepAt(judgeIndex(this.step) + 1);
        // The consent step collapses into the flow: the statement is shown once on the image step.
        if (this.step === "consent" && this.permissions.local) {
            this.completed.add("consent");
            this.step = judgeStepAt(judgeIndex(this.step) + 1);
        }
        return true;
    }
    skip() {
        if (this.step === "plans")
            return false;
        this.skipped.add(this.step);
        this.completed.delete(this.step);
        this.step = judgeStepAt(judgeIndex(this.step) + 1);
        return true;
    }
    back() {
        const index = judgeIndex(this.step);
        if (index === 0)
            return false;
        this.step = judgeStepAt(index - 1);
        if (this.step === "consent" && this.permissions.local && index - 1 > 0)
            this.step = judgeStepAt(index - 2);
        return true;
    }
    progress() {
        const number = judgeIndex(this.step) + 1;
        return { number, total: JUDGE_STEPS.length, percent: Math.round(number / JUDGE_STEPS.length * 100) };
    }
    reset() {
        this.step = "source";
        this.source = null;
        this.permissions = { ...EMPTY_PERMISSIONS };
        this.hair = "none";
        this.face = "none";
        this.details = { ...EMPTY_JUDGE_DETAILS };
        this.mock = false;
        this.strength = 5.0;
        this.comparison = 50;
        this.format = "image/png";
        this.size = "standard";
        this.completed.clear();
        this.skipped.clear();
    }
}
//# sourceMappingURL=judge-session.js.map