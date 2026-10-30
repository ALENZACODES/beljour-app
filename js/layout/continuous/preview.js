import { subjectEditDecision } from "../subjects/authority.js";
import { composeIsolatedSubject } from "../subjects/pixel-guard.js";
import { burnJudgeLabel, paintJudgeLook } from "../../ui/shell/judge-canvas.js";
/** The old five-edit renderer understands this exact public JudgeState contract. */
export function tourJudgeState(state) {
    const canHair = state.permissions.local && state.permissions.hair && state.identityLock;
    const canFace = state.permissions.local && state.permissions.face && state.identityLock;
    return {
        step: "face",
        source: state.sourceLoaded ? "sample" : null,
        permissions: { ...state.permissions },
        hair: canHair && state.applied.hair ? "chestnut" : "none",
        face: canFace && state.applied.concealer ? "warm" : "none",
        details: {
            "hair-highlight": canHair && state.applied.colour,
            "lip-colour": false,
            eyeliner: false,
        },
        mock: state.mockResult === "mock-applied",
        comparison: state.comparePercent,
        format: "image/png",
        size: "standard",
        strength: state.levels.hair,
        complete: [],
        skipped: [],
    };
}
function sourceDrawn(original, target) {
    target.width = original.width;
    target.height = original.height;
    const ctx = target.getContext("2d", { alpha: false });
    if (!ctx)
        throw new Error("No preview Canvas available");
    ctx.drawImage(original, 0, 0);
}
/** Every byte outside the selected drawn face is restored from the original. */
export function drawContinuousPreview(original, target, state, subjects, label = false) {
    if (!state.sourceLoaded) {
        return { visual: "unavailable", protectedBystanders: false, note: "Choose a drawn sample" };
    }
    const decision = subjectEditDecision(subjects);
    if (!decision.allowed || !decision.ticket || !subjects.selectedId || !state.identityLock) {
        sourceDrawn(original, target);
        if (label)
            burnJudgeLabelContext(target);
        return {
            visual: "original", protectedBystanders: false,
            note: "No checked active subject and identity lock. Preview unchanged.",
        };
    }
    const candidate = original.ownerDocument.createElement("canvas");
    try {
        paintJudgeLook(original, candidate, tourJudgeState(state), "standard", false, decision.ticket.target, false);
        const originalCtx = original.getContext("2d", { willReadFrequently: true });
        const candidateCtx = candidate.getContext("2d", { willReadFrequently: true });
        const targetCtx = target.getContext("2d");
        if (!originalCtx || !candidateCtx || !targetCtx)
            throw new Error("Canvas not available");
        const width = original.width;
        const height = original.height;
        if (candidate.width !== width || candidate.height !== height) {
            throw new Error("Diagram output changed dimensions");
        }
        const before = originalCtx.getImageData(0, 0, width, height);
        const after = candidateCtx.getImageData(0, 0, width, height);
        const isolated = composeIsolatedSubject({ width, height, rgba: before.data }, { width, height, rgba: after.data }, decision.ticket, subjects);
        target.width = width;
        target.height = height;
        const exact = new Uint8ClampedArray(isolated.frame.rgba);
        const frame = new ImageData(exact, width, height);
        targetCtx.putImageData(frame, 0, 0);
        if (label)
            burnJudgeLabelContext(target);
        return {
            visual: "illustration", protectedBystanders: true,
            note: "Only checked drawn subject pixels differ; all bystanders preserved byte-for-byte.",
        };
    }
    catch {
        sourceDrawn(original, target);
        if (label)
            burnJudgeLabelContext(target);
        return {
            visual: "original", protectedBystanders: false,
            note: "Pixel isolation was unavailable. Original shown unchanged.",
        };
    }
    finally {
        candidate.width = 0;
        candidate.height = 0;
    }
}
function burnJudgeLabelContext(target) {
    const context = target.getContext("2d");
    if (!context)
        throw new Error("Canvas label unavailable");
    burnJudgeLabel(context, target.width, target.height);
}
/** Human-readable guides do not change pixels without the validated owner engine. */
export function advancedGuide(step, state) {
    if (step === "appearance") {
        return `Illustrative ${state.appearanceCue} cues at ${state.levels.appearance.toFixed(1)} of 5.0. `
            + "No sex, gender identity or facial anatomy is inferred.";
    }
    if (step === "ratio") {
        return `Reference-grid intensity ${state.levels.ratio.toFixed(1)} of 5.0. `
            + "No measured golden-ratio score is available from a drawn bounding box.";
    }
    if (step === "turn") {
        return `Turn guide ${state.levels.turn.toFixed(1)} of 5.0. `
            + "Hidden-side reconstruction is not produced without a validated engine.";
    }
    if (step === "posture") {
        return `Pose guide ${state.levels.posture.toFixed(1)} of 5.0. `
            + "The original body pixels remain unchanged without the public pose engine.";
    }
    if (step === "concealer") {
        return `Decorative cheek-placement diagram at ${state.levels.concealer.toFixed(1)} of 5.0. `
            + "Not a medical assessment or verified complexion match.";
    }
    return "Local illustrative preview; real results require the production engine and consent.";
}
//# sourceMappingURL=preview.js.map