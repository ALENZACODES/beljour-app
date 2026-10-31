/** Keyboard-accessible review of local thumbnail pixels; no live task controls. Author: John Khan. */
import { FRAME_CAPTIONS, FRAME_IDS, } from "../../layout/continuous/frame-cache-contract.js";
import { judgeNode, judgeParagraph } from "./judge-elements.js";
function control(doc, text, key, action) {
    const button = judgeNode(doc, "button", "lg-cache-control", text);
    button.type = "button";
    button.dataset.cacheAction = key;
    button.addEventListener("click", action);
    return button;
}
function drawCachedFrame(doc, frame) {
    const figure = judgeNode(doc, "figure", "lg-cache-figure");
    const picture = judgeNode(doc, "canvas", "lg-cache-canvas");
    picture.width = frame.width;
    picture.height = frame.height;
    picture.setAttribute("role", "img");
    picture.setAttribute("aria-label", `${frame.id} local illustrated thumbnail, not YouCam output`);
    const context = picture.getContext("2d");
    if (!context)
        throw new Error("Cached frame canvas is unavailable");
    try {
        const pixels = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height);
        context.putImageData(pixels, 0, 0);
    }
    finally {
        frame.rgba.fill(0);
    }
    const caption = judgeNode(doc, "figcaption", "lg-cache-caption", FRAME_CAPTIONS[frame.id]);
    figure.append(picture, caption);
    return figure;
}
/** Rendering reads only a short-lived copy; no frame enters HTML attributes or storage. */
export function renderContinuousFramePanel(doc, summary, selected, actions, replay) {
    const panel = judgeNode(doc, "section", "lg-cache-panel");
    panel.setAttribute("aria-label", "Cached local illustrations");
    panel.append(judgeNode(doc, "h3", "lg-cache-heading", "Offline result replay"));
    panel.append(judgeParagraph(doc, "Frames are rendered from original drawings in this browser. "
        + "They are not saved YouCam results, clinical measurements or product claims.", "lg-cache-caption"));
    const commands = judgeNode(doc, "div", "lg-cache-controls");
    const warm = control(doc, "Prepare three local frames", "prepare", actions.prepare);
    warm.disabled = summary.phase === "warming";
    commands.append(warm);
    const clear = control(doc, "Clear frames", "clear", actions.clear);
    clear.disabled = summary.available === 0 && summary.phase !== "warming";
    commands.append(clear);
    panel.append(commands);
    const status = judgeParagraph(doc, summary.phase === "ready"
        ? `Three local frames available (${summary.bytes} bytes of temporary memory).`
        : summary.phase === "warming"
            ? "Rendering local illustration frames. No network calls."
            : summary.phase === "refused"
                ? "Cache unavailable: consent, drawn subject and identity lock are required."
                : summary.phase === "stale"
                    ? "Earlier cached frames were discarded after settings changed."
                    : "No cached image frames. Drawn examples can still be reviewed individually.", "lg-cache-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    panel.append(status);
    if (summary.phase === "ready") {
        const switcher = judgeNode(doc, "div", "lg-cache-tabs");
        switcher.setAttribute("role", "group");
        switcher.setAttribute("aria-label", "Select local cached image family");
        for (const id of FRAME_IDS) {
            const choose = control(doc, `Review ${id} illustration`, `select-${id}`, () => actions.choose(id));
            choose.setAttribute("aria-pressed", String(summary.selected === id));
            switcher.append(choose);
        }
        panel.append(switcher);
        if (selected)
            panel.append(drawCachedFrame(doc, selected));
        if (replay) {
            const area = judgeNode(doc, "section", "lg-cache-playback");
            area.setAttribute("aria-label", "Offline cached-image rehearsal");
            area.append(judgeNode(doc, "h4", "lg-cache-playback-heading", "Three-frame rehearsal"));
            const playStatus = judgeParagraph(doc, `${replay.snapshot.observed} of 3 locally cached images reviewed; `
                + `state: ${replay.snapshot.phase}. No provider request or automatic download.`, "lg-cache-caption");
            playStatus.setAttribute("aria-live", "polite");
            playStatus.setAttribute("role", "status");
            area.append(playStatus);
            const controls = judgeNode(doc, "div", "lg-cache-controls");
            const actionsList = [
                ["Play cached frames", "play", replay.actions.play],
                ["Pause", "pause", replay.actions.pause],
                ["Resume", "resume", replay.actions.resume],
                ["Next cached frame", "advance", replay.actions.advance],
                ["Stop", "stop", replay.actions.stop],
            ];
            for (const [text, action, callback] of actionsList) {
                const trigger = control(doc, text, `replay-${action}`, callback);
                trigger.disabled = (action === "pause" && replay.snapshot.phase !== "playing")
                    || (action === "resume" && replay.snapshot.phase !== "paused")
                    || (action === "advance" && replay.snapshot.phase === "complete");
                controls.append(trigger);
            }
            area.append(controls);
            panel.append(area);
        }
        const report = control(doc, "Download photo-free cache report", "report", actions.report);
        panel.append(report);
    }
    panel.append(judgeParagraph(doc, "A cache hit means a local rendering was reused. Provider calls: 0. "
        + "Real-face and frozen release evidence: not verified.", "lg-cache-caption"));
    return panel;
}
