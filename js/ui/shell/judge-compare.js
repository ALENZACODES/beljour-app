import { drawJudgeComparison, paintJudgeLook } from "./judge-canvas.js";
import { judgeHeading, judgeNode, judgeParagraph, judgePreview } from "./judge-elements.js";
export function comparisonLegend(value) {
    return `${value}% original on the left, ${100 - value}% illustrated result on the right.`;
}
export function renderJudgeCompare(doc, host, state, image, onChange) {
    const panel = judgeNode(doc, "section", "lg-judge-compare");
    panel.append(judgeHeading(doc, "Before and after"));
    panel.append(judgeParagraph(doc, "The left side is your starting image; the right side is a labelled illustrative overlay. "
        + "Neither is a scored filter result."));
    if (!state.source || !image.hasImage) {
        panel.append(judgeParagraph(doc, "No image has been selected. Go back to step 1, or skip to see the export options."));
        host.replaceChildren(panel);
        return;
    }
    const edited = judgePreview(doc, "Temporary edited illustration used for comparison");
    const visible = judgePreview(doc, "Image comparison controlled by the slider below");
    const redraw = (percent) => {
        paintJudgeLook(image.original, edited, state, "standard", true, image.activeSubject, image.allowUntrackedDrawing);
        drawJudgeComparison(image.original, edited, visible, percent);
    };
    try {
        redraw(state.comparison);
    }
    catch {
        panel.append(judgeParagraph(doc, "Canvas comparison is unavailable on this device."));
    }
    const frame = judgeNode(doc, "div", "lg-judge-visual lg-judge-compare-frame");
    frame.append(visible);
    const controls = judgeNode(doc, "div", "lg-judge-compare-controls");
    const label = judgeNode(doc, "label", "", "Move the divider to compare");
    label.htmlFor = "lg-judge-comparison";
    const slider = judgeNode(doc, "input", "lg-judge-slider");
    slider.type = "range";
    slider.id = "lg-judge-comparison";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = String(state.comparison);
    slider.setAttribute("aria-describedby", "lg-judge-compare-value");
    const value = judgeParagraph(doc, comparisonLegend(state.comparison), "lg-judge-small");
    value.id = "lg-judge-compare-value";
    slider.addEventListener("input", () => {
        const percent = Number(slider.value);
        if (!Number.isFinite(percent))
            return;
        onChange(percent);
        value.textContent = comparisonLegend(percent);
        try {
            redraw(percent);
        }
        catch {
            value.textContent = "Comparison preview is unavailable.";
        }
    });
    controls.append(label, slider, value);
    panel.append(frame, controls);
    panel.append(judgeParagraph(doc, "Both files stay in browser memory. Only the export step saves a local file.", "lg-judge-small"));
    host.replaceChildren(panel);
}
