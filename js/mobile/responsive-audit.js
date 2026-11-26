function rounded(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100000)
        return null;
    return Math.round(value);
}
function isControl(element) {
    const tag = element.tagName.toUpperCase();
    return ["A", "BUTTON", "SELECT", "TEXTAREA", "INPUT", "SUMMARY"].includes(tag)
        || ["button", "link"].includes(element.getAttribute("role") ?? "");
}
function visible(element, style) {
    return !element.hidden && element.getAttribute("aria-hidden") !== "true"
        && element.getAttribute("hidden") === null && style?.display !== "none" && style?.visibility !== "hidden";
}
function fontSize(style) {
    if (!style?.fontSize)
        return null;
    const match = /^(\d+(?:\.\d+)?)px$/.exec(style.fontSize.trim());
    return match ? Number(match[1]) : null;
}
/** Records aggregate layout measurements, not a visual-regression pass. */
export function inspectResponsiveLayout(root, options = {}) {
    if (!root || typeof root.tagName !== "string")
        throw new TypeError("A real page element is required");
    const max = options.maxNodes ?? 2500;
    if (!Number.isInteger(max) || max < 1 || max > 5000)
        throw new RangeError("Invalid scan bound");
    let seen = 0;
    let smallTouch = 0;
    let smallText = 0;
    let inspected = 0;
    const stack = [root];
    while (stack.length && inspected < max) {
        const element = stack.pop();
        if (!element)
            break;
        const style = options.style?.(element);
        if (!visible(element, style))
            continue;
        inspected += 1;
        if (isControl(element) && !element.disabled) {
            const box = element.getBoundingClientRect?.();
            if (box && box.width > 0 && box.height > 0) {
                seen += 1;
                if (box.width < 44 || box.height < 44)
                    smallTouch += 1;
            }
        }
        const size = fontSize(style);
        if (size !== null && size < 12 && element.children.length === 0 && Boolean(element.textContent?.trim())) {
            smallText += 1;
        }
        for (const child of Array.from(element.children).reverse()) {
            if (child && typeof child.getAttribute === "function")
                stack.push(child);
        }
    }
    const viewportWidth = rounded(options.viewportWidth);
    const contentWidth = rounded(options.contentWidth);
    const overflowPixels = viewportWidth !== null && contentWidth !== null
        ? Math.max(0, contentWidth - viewportWidth) : null;
    const warnings = [];
    if (overflowPixels === null)
        warnings.push("Viewport overflow was not measurable.");
    else if (overflowPixels > 1)
        warnings.push("The inspected layout exceeds the viewport.");
    if (smallTouch)
        warnings.push("Some measured controls are under the 44px project target.");
    if (smallText)
        warnings.push("Some visible text is below the 12px functional minimum.");
    if (stack.length)
        warnings.push("The bounded scan did not inspect every visible element.");
    warnings.push("Test 320px/390px, zoom and landscape physically; this scan cannot emulate them.");
    return {
        viewportWidth,
        contentWidth,
        controlsSeen: seen,
        smallTouchControls: smallTouch,
        smallTextElements: smallText,
        overflowPixels,
        sampled: stack.length > 0,
        label: "measurement-not-certification",
        warnings,
    };
}
//# sourceMappingURL=responsive-audit.js.map