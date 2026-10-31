function hasName(element, referenceExists) {
    const explicit = element.getAttribute("aria-label")?.trim();
    if (explicit)
        return true;
    const referenced = element.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
    if (referenced.length && referenced.every((id) => referenceExists?.(id) ?? false))
        return true;
    const title = element.getAttribute("title")?.trim();
    if (title)
        return true;
    const tag = element.tagName.toUpperCase();
    if (tag === "A" || tag === "BUTTON" || tag === "SUMMARY") {
        return Boolean(element.textContent?.trim());
    }
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        const typed = element;
        return Boolean(typed.labels && typed.labels.length > 0)
            || element.parentElement?.tagName.toUpperCase() === "LABEL";
    }
    return false;
}
function outlineHint(style) {
    if (!style)
        return "unknown";
    const width = Number.parseFloat(style.outlineWidth ?? "");
    const outline = style.outlineStyle && style.outlineStyle !== "none" && width >= 2;
    const shadow = style.boxShadow && style.boxShadow !== "none";
    return outline || shadow ? "visible" : "unknown";
}
export class KeyboardRehearsal {
    host;
    options;
    total = 0;
    tabs = 0;
    named = 0;
    unnamed = 0;
    rings = 0;
    unknown = 0;
    outsideOrder = 0;
    active = false;
    focusListener;
    keyListener;
    constructor(host, options = {}) {
        this.host = host;
        this.options = options;
        this.focusListener = (event) => {
            if (!this.active || this.total >= 250)
                return;
            const target = event.target;
            if (!target || typeof target.getAttribute !== "function")
                return;
            const element = target;
            this.total += 1;
            if (hasName(element, this.options.referenceExists))
                this.named += 1;
            else
                this.unnamed += 1;
            if (outlineHint(this.options.getStyle?.(element)) === "visible")
                this.rings += 1;
            else
                this.unknown += 1;
            if (element.getAttribute("tabindex") === "-1")
                this.outsideOrder += 1;
        };
        this.keyListener = (event) => {
            if (!this.active || this.tabs >= 250)
                return;
            if (event.key === "Tab")
                this.tabs += 1;
            // No key code, pressed character, value or focused element is retained.
        };
    }
    start() {
        if (this.active)
            return;
        this.total = 0;
        this.tabs = 0;
        this.named = 0;
        this.unnamed = 0;
        this.rings = 0;
        this.unknown = 0;
        this.outsideOrder = 0;
        this.active = true;
        this.host.addEventListener("focusin", this.focusListener);
        this.host.addEventListener("keydown", this.keyListener);
    }
    stop() {
        if (this.active) {
            this.host.removeEventListener("focusin", this.focusListener);
            this.host.removeEventListener("keydown", this.keyListener);
        }
        this.active = false;
        return this.snapshot;
    }
    get snapshot() {
        return {
            recordedFocus: this.total,
            tabRequests: this.tabs,
            namedControls: this.named,
            unnamedControls: this.unnamed,
            visibleRingHints: this.rings,
            ringUnknown: this.unknown,
            notInTabOrder: this.outsideOrder,
            active: this.active,
            proof: "manual-hint-only",
        };
    }
    dispose() { this.stop(); }
}
export function keyboardEvidenceText(result) {
    return `${result.tabRequests} Tab requests, ${result.recordedFocus} focus events, `
        + `${result.unnamedControls} potentially unnamed controls. Focus ring visibility needs human review.`;
}
