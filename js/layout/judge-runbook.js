/** Exact, non-fictional operator talk track for a three-minute local demo. */
import { JUDGE_STEPS } from "./judge-contract.js";
import { JUDGE_TARGET_MS, formatRehearsalTime } from "./judge-rehearsal.js";
export const JUDGE_CUES = [
    {
        step: "source",
        targetSeconds: 15,
        instruction: "Open the drawn example or select a photo locally.",
        narration: "The demo begins in the browser. The example is a drawing, not a person's photo.",
        honestBoundary: "A drawn portrait does not validate face tracking or realism.",
        recovery: "If file decoding fails, use the drawn example. Do not claim the upload succeeded.",
        keyboard: "Tab to the sample button and press Enter.",
    },
    {
        step: "consent",
        targetSeconds: 25,
        instruction: "Read local-processing scope, then opt into each illustration action.",
        narration: "Each editing choice is separate. These checks do not permit a real provider upload.",
        honestBoundary: "No YouCam consent is given or reused by this screen.",
        recovery: "Skip rather than activate an action without permission.",
        keyboard: "Tab through checkboxes, using Space to toggle each choice.",
    },
    {
        step: "hair",
        targetSeconds: 25,
        instruction: "Apply one decorative hair colour and adjust its strength.",
        narration: "This is a browser illustration, not generated hair and not a measured result.",
        honestBoundary: "A flat overlay cannot demonstrate live hair transformation quality.",
        recovery: "If Canvas fails, note the failure and skip instead of claiming a rendered edit.",
        keyboard: "Tab to a hair choice; use the native range control for strength.",
    },
    {
        step: "face",
        targetSeconds: 25,
        instruction: "Apply one face-colour illustration without diagnostic claims.",
        narration: "The effect is an illustrative visual, not a skin condition or health assessment.",
        honestBoundary: "No skin inference, identity check or quantitative quality evidence is produced.",
        recovery: "Keep the original and move on if the effect cannot render.",
        keyboard: "Choose the face option with Tab and Enter, not a custom gesture.",
    },
    {
        step: "tryon",
        targetSeconds: 25,
        instruction: "Show the explicitly labelled mock try-on.",
        narration: "This mocks the user journey. It does not call or stand in for a successful YouCam API.",
        honestBoundary: "The required real API demonstration must occur in the separate live product flow.",
        recovery: "If mock consent is missing, return to consent or skip visibly.",
        keyboard: "Tab to the mock action and press Enter.",
    },
    {
        step: "compare",
        targetSeconds: 20,
        instruction: "Move the comparison divider and show the unchanged starting image.",
        narration: "This compares the original pixels with the local illustration.",
        honestBoundary: "A comparison slider by itself proves neither accuracy nor fairness.",
        recovery: "If comparison rendering fails, leave the original untouched and report it.",
        keyboard: "Focus the divider slider and use the arrow keys.",
    },
    {
        step: "export",
        targetSeconds: 30,
        instruction: "Choose a format and request a permanently labelled download.",
        narration: "The simulation notice is painted into the export, not merely placed over it.",
        honestBoundary: "Browser download initiation is distinct from verifying a saved file on disk.",
        recovery: "If saving fails, switch format or size and retry; never report success without a request.",
        keyboard: "Use the format and size selectors, then activate Save with Enter.",
    },
    {
        step: "plans",
        targetSeconds: 15,
        instruction: "Show the demo prices and close without signing up.",
        narration: "The three-day trial and prices are mock commercial copy; no billing is connected.",
        honestBoundary: "No actual subscription, free trial or payment is created.",
        recovery: "Exit the local demonstration. Real provider setup is separate and requires approval.",
        keyboard: "Use Exit or Finish. Escape also exits from a non-editable focus target.",
    },
];
export function judgeRunbook(state, witness, actualMs) {
    if (!Number.isFinite(actualMs) || actualMs < 0)
        throw new RangeError("Invalid elapsed time");
    let elapsed = 0;
    const rows = JUDGE_CUES.map((cue, index) => {
        elapsed += cue.targetSeconds * 1000;
        const evidence = witness.rows.find((row) => row.id === cue.step);
        return {
            ...cue,
            number: index + 1,
            deadlineMs: elapsed,
            targetLabel: formatRehearsalTime(elapsed),
            observed: evidence?.status === "observed",
        };
    });
    const index = JUDGE_STEPS.findIndex((step) => step.id === state.step);
    if (index < 0)
        throw new RangeError("Unknown walkthrough step");
    const active = rows[index];
    return {
        rows,
        active,
        targetMs: JUDGE_TARGET_MS,
        actualMs,
        timeStatus: actualMs <= JUDGE_TARGET_MS ? "within-rehearsal-target" : "over-rehearsal-target",
        totalMinutes: formatRehearsalTime(JUDGE_TARGET_MS),
        isMobileBenchmark: false,
    };
}
/** The guide is exactly three minutes on paper; it does not guarantee a user's pace. */
export function validateJudgeCuePlan() {
    const errors = [];
    if (JUDGE_CUES.length !== JUDGE_STEPS.length)
        errors.push("Missing a step cue");
    const total = JUDGE_CUES.reduce((sum, cue) => sum + cue.targetSeconds, 0);
    if (total !== 180)
        errors.push("Cue durations must total 180 seconds");
    const seen = new Set();
    for (const cue of JUDGE_CUES) {
        if (seen.has(cue.step))
            errors.push(`Duplicate step cue: ${cue.step}`);
        seen.add(cue.step);
        if (!Number.isInteger(cue.targetSeconds) || cue.targetSeconds <= 0) {
            errors.push(`Invalid cue duration: ${cue.step}`);
        }
        if (!cue.instruction || !cue.narration || !cue.honestBoundary || !cue.recovery || !cue.keyboard) {
            errors.push(`Incomplete cue: ${cue.step}`);
        }
    }
    for (const step of JUDGE_STEPS) {
        if (!seen.has(step.id))
            errors.push(`No cue for ${step.id}`);
    }
    return errors;
}
