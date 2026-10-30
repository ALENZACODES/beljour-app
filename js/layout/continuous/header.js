/** Own-brand header for the continuous, local-only demonstration. */
import { judgeNode, judgeParagraph } from "../../ui/shell/judge-elements.js";
export function renderContinuousHeader(doc, state) {
    if (!Number.isInteger(state.index) || !Number.isInteger(state.total)
        || state.total < 1 || state.index < 0 || state.index >= state.total) {
        throw new RangeError("Invalid tour progress");
    }
    const header = judgeNode(doc, "header", "lg-cont-header");
    const brand = judgeNode(doc, "span", "lg-demo-monogram");
    brand.setAttribute("aria-label", "BELJOUR — FULL BEAUTY STUDIO. Your best day. Still you.");
    brand.append(judgeNode(doc, "span", "lg-demo-wordmark", "BELJOUR"), judgeNode(doc, "span", "lg-demo-brand-description", "FULL BEAUTY STUDIO"), judgeNode(doc, "span", "lg-demo-brand-tagline", "Your best day. Still you."));
    const title = judgeNode(doc, "h2", "", "Guided product demonstration");
    title.id = "lg-cont-title";
    title.tabIndex = -1;
    const progress = judgeParagraph(doc, `Step ${state.index + 1} of ${state.total}: ${state.title}`);
    progress.setAttribute("aria-live", state.announce ? "polite" : "off");
    progress.setAttribute("aria-atomic", "true");
    header.append(brand, title, progress, judgeParagraph(doc, state.caption));
    return { header, title };
}
//# sourceMappingURL=header.js.map