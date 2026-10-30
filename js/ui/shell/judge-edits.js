/** Screens for three distinct edits, each gated by in-memory action consent. */
import { LOCAL_DISCLOSURE, MOCK_DISCLOSURE, } from "../../layout/judge-contract.js";
import { paintJudgeLook } from "./judge-canvas.js";
import { judgeChoice, judgeHeading, judgeNode, judgeNotice, judgeParagraph, judgePreview, } from "./judge-elements.js";
import { renderIdentityControls } from "./identity-controls.js";
function applyEnhancements(doc, panel, family, state, enhancements) {
    if (!enhancements)
        return;
    const controls = renderIdentityControls(doc, {
        family,
        photoRevision: String(enhancements.revision),
        strength: state.strength,
        controller: enhancements.lock,
        onStrength: enhancements.onStrength,
        onTune: enhancements.onTune,
    });
    panel.append(controls.element);
}
function editPreview(doc, state, image, label, enhancements) {
    const figure = judgeNode(doc, "figure", "lg-judge-visual");
    if (!state.source || !image.hasImage) {
        figure.append(judgeNode(doc, "div", "lg-judge-empty", "First choose an image on step 1."));
        return figure;
    }
    const canvas = judgePreview(doc, label);
    try {
        if (enhancements) {
            enhancements.cache.render(doc, {
                photo: String(enhancements.revision),
                edit: JSON.stringify([state.hair, state.face, state.details, state.mock, state.step, image.activeSubject?.id]),
                strength: state.strength,
                tuning: enhancements.lock.snapshot.looseness,
            }, canvas, (target) => paintJudgeLook(image.original, target, state, "standard", true, image.activeSubject, image.allowUntrackedDrawing));
        }
        else {
            paintJudgeLook(image.original, canvas, state, "standard", true, image.activeSubject, image.allowUntrackedDrawing);
        }
    }
    catch {
        figure.append(judgeParagraph(doc, "Preview not available on this browser."));
    }
    figure.append(canvas);
    figure.append(judgeNode(doc, "figcaption", "lg-judge-small", "Illustration only · fixed-position overlays · not face tracked"));
    return figure;
}
function editColumns(doc, copy, preview, host) {
    const columns = judgeNode(doc, "div", "lg-judge-columns");
    columns.append(copy, preview);
    host.replaceChildren(columns);
}
export function renderJudgeHair(doc, host, state, image, onHair, enhancements) {
    const panel = judgeNode(doc, "div", "lg-judge-controls");
    panel.append(judgeHeading(doc, "Hair colour: illustrative overlay"));
    panel.append(judgeParagraph(doc, "Choose one original colour. This does not generate hair, find hair strands, or claim real styling accuracy."));
    const choices = judgeNode(doc, "div", "lg-judge-choices");
    const enabled = Boolean(state.source && state.permissions.local && state.permissions.hair
        && (enhancements?.canEdit ?? true));
    choices.append(judgeChoice(doc, "hair", "chestnut", "Chestnut", state.hair === "chestnut", () => onHair("chestnut"), enabled));
    choices.append(judgeChoice(doc, "hair", "deep-blue", "Deep blue", state.hair === "deep-blue", () => onHair("deep-blue"), enabled));
    choices.append(judgeChoice(doc, "hair", "none", "No hair overlay", state.hair === "none", () => onHair("none"), enabled));
    panel.append(choices);
    const highlight = judgeChoice(doc, "detail", "hair-highlight", state.details["hair-highlight"] ? "Remove hair highlights" : "Add hair highlights", state.details["hair-highlight"], () => enhancements?.onDetail?.("hair-highlight", !state.details["hair-highlight"]), enabled);
    panel.append(highlight);
    applyEnhancements(doc, panel, "hair", state, enhancements);
    panel.append(judgeNotice(doc, "Local demo", enabled
        ? LOCAL_DISCLOSURE
        : "Select a photo and opt into the hair action on step 2, or skip."));
    editColumns(doc, panel, editPreview(doc, state, image, "Preview with optional illustrative hair overlay", enhancements), host);
}
export function renderJudgeFace(doc, host, state, image, onFace, enhancements) {
    const panel = judgeNode(doc, "div", "lg-judge-controls");
    panel.append(judgeHeading(doc, "Face detail: illustrative blush"));
    panel.append(judgeParagraph(doc, "Add a soft colour overlay to drawn cheek positions. This is not a measured skin or facial analysis."));
    const choices = judgeNode(doc, "div", "lg-judge-choices");
    const enabled = Boolean(state.source && state.permissions.local && state.permissions.face
        && (enhancements?.canEdit ?? true));
    choices.append(judgeChoice(doc, "face", "warm", "Warm", state.face === "warm", () => onFace("warm"), enabled));
    choices.append(judgeChoice(doc, "face", "cool", "Cool", state.face === "cool", () => onFace("cool"), enabled));
    choices.append(judgeChoice(doc, "face", "none", "No face overlay", state.face === "none", () => onFace("none"), enabled));
    panel.append(choices);
    const lip = judgeChoice(doc, "detail", "lip-colour", state.details["lip-colour"] ? "Remove lip colour" : "Add lip colour", state.details["lip-colour"], () => enhancements?.onDetail?.("lip-colour", !state.details["lip-colour"]), enabled);
    const liner = judgeChoice(doc, "detail", "eyeliner", state.details.eyeliner ? "Remove eyeliner" : "Add eyeliner", state.details.eyeliner, () => enhancements?.onDetail?.("eyeliner", !state.details.eyeliner), enabled);
    panel.append(lip, liner);
    applyEnhancements(doc, panel, "face", state, enhancements);
    panel.append(judgeNotice(doc, "Local demo", enabled
        ? LOCAL_DISCLOSURE
        : "Select an image and opt into the face action on step 2, or skip."));
    editColumns(doc, panel, editPreview(doc, state, image, "Preview with optional illustrative face overlay", enhancements), host);
}
export function renderJudgeMock(doc, host, state, image, onMock, enhancements) {
    const panel = judgeNode(doc, "div", "lg-judge-controls");
    panel.append(judgeHeading(doc, "Mock YouCam try-on"));
    panel.append(judgeParagraph(doc, MOCK_DISCLOSURE));
    const enabled = Boolean(state.source && state.permissions.local && state.permissions.mock
        && (enhancements?.canEdit ?? true));
    const start = judgeChoice(doc, "mock", "tryon", state.mock ? "Mock overlay shown" : "Show illustrative try-on", state.mock, onMock, enabled);
    panel.append(start);
    applyEnhancements(doc, panel, "mock", state, enhancements);
    panel.append(judgeNotice(doc, "Not a live API result", enabled
        ? "A blue accessory overlay represents where a live try-on could appear. No YouCam unit is consumed."
        : "Opt into the mock try-on on step 2. This does not grant live YouCam access."));
    panel.append(judgeParagraph(doc, "For the real, separately consented flow, open the Photo lab and choose a styling action.", "lg-judge-small"));
    const link = judgeNode(doc, "a", "lg-judge-inline-link", "Open real Photo lab");
    link.href = "index.html#/photo";
    panel.append(link);
    editColumns(doc, panel, editPreview(doc, state, image, "Preview with optional mock accessory overlay", enhancements), host);
}
//# sourceMappingURL=judge-edits.js.map