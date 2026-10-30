/** Truthful local walkthrough coverage: never substitutes for provider proof. */
import { JUDGE_STEPS, } from "./judge-contract.js";
const EVIDENCE_EXPLANATIONS = {
    source: "Choose a runtime-drawn sample or a local file, not a supplied real-person fixture.",
    consent: "Review local actions; separate real-provider consent is not granted here.",
    hair: "The selected hair overlay is decorative, not generated or tracked.",
    face: "The selected face overlay is illustrative, not a diagnostic or quality result.",
    tryon: "The accessory is mock-only; zero YouCam units are consumed.",
    compare: "The before/after comparison is a local Canvas view.",
    export: "The saved raster always contains the simulation label.",
    plans: "The trial and prices are illustrative; no charge or subscription is created.",
};
export function stepEvidence(state, step) {
    const item = JUDGE_STEPS.find((row) => row.id === step);
    if (!item)
        throw new RangeError("Unknown walkthrough step");
    const note = EVIDENCE_EXPLANATIONS[step];
    if (state.skipped.includes(step)) {
        return { step, label: item.short, status: "skipped", note };
    }
    if (state.complete.includes(step)) {
        return { step, label: item.short, status: "done", note };
    }
    let ready = true;
    if (step === "source")
        ready = state.source !== null;
    if (step === "consent")
        ready = state.permissions.local;
    if (step === "hair")
        ready = state.hair !== "none";
    if (step === "face")
        ready = state.face !== "none";
    if (step === "tryon")
        ready = state.mock;
    if (step === "compare" || step === "export")
        ready = state.source !== null;
    return {
        step,
        label: item.short,
        status: ready ? "ready" : "action-needed",
        note,
    };
}
export function summarizeJudgeEvidence(state) {
    const rows = JUDGE_STEPS.map((step) => stepEvidence(state, step.id));
    return {
        done: rows.filter((row) => row.status === "done").length,
        skipped: rows.filter((row) => row.status === "skipped").length,
        actionNeeded: rows.filter((row) => row.status === "action-needed").length,
        total: JUDGE_STEPS.length,
        hasSelectedImage: state.source !== null,
        realProviderVerified: false,
        exportIsLabelled: true,
        rows,
    };
}
export function judgeEvidencePlainText(state) {
    const summary = summarizeJudgeEvidence(state);
    const lines = [
        "BELJOUR — FULL BEAUTY STUDIO · Your best day. Still you. — local Judge Mode rehearsal",
        "Evidence type: illustrative browser demo only",
        `Guide: ${summary.done} completed, ${summary.skipped} skipped, ${summary.total} steps total`,
        "Real provider integration: not demonstrated by this walkthrough",
        "Simulation export: permanent label required",
        "No photos, names, device identifiers or timings included",
    ];
    for (const row of summary.rows) {
        lines.push(`${row.label}: ${row.status}; ${row.note}`);
    }
    return lines.join("\n");
}
export function safeEvidenceNote(state) {
    const summary = summarizeJudgeEvidence(state);
    if (!summary.hasSelectedImage) {
        return "No image was chosen. You can still inspect the steps; saving stays disabled.";
    }
    if (summary.skipped > 0) {
        return `${summary.skipped} step(s) skipped. A skipped step is not a completed proof.`;
    }
    return "Progress describes only this local illustration, not live provider validation.";
}
//# sourceMappingURL=judge-readiness.js.map