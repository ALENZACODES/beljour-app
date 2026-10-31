const ACTION_RE = /^[a-z][a-z0-9/_-]{0,95}$/i;
/** A parent walk avoids applying selectors or interpreting content supplied by a user. */
export function descendantOf(node, host) {
    let current = node;
    for (let depth = 0; depth < 64; depth += 1) {
        if (!current)
            return false;
        if (current === host)
            return true;
        current = current.parentNode ?? null;
    }
    return false;
}
export function focusAction(node) {
    if (!node)
        return null;
    const tag = node.tagName?.toUpperCase() ?? "";
    if (tag !== "INPUT" && tag !== "BUTTON" && tag !== "SELECT"
        && tag !== "TEXTAREA")
        return null;
    if (node.disabled || node.hidden || node.getAttribute?.("aria-hidden") === "true") {
        return null;
    }
    const key = node.dataset?.tourAction;
    if (typeof key !== "string" || !ACTION_RE.test(key))
        return null;
    return key;
}
function matchingControl(root, action) {
    if (!ACTION_RE.test(action))
        return null;
    for (const selector of ["button", "input", "select", "textarea"]) {
        for (const element of root.querySelectorAll(selector)) {
            const node = element;
            if (focusAction(node) === action)
                return node;
        }
    }
    return null;
}
/** Only a fixed action key and step identifier are retained, never a field value. */
export class ContinuousFocusSession {
    previous = null;
    preferred = null;
    disposed = false;
    get snapshot() {
        return this.previous ? { ...this.previous } : null;
    }
    capture(doc, root, step) {
        if (this.disposed)
            return;
        this.previous = null;
        if (!step || !/^[a-z][a-z-]{0,63}$/.test(step))
            return;
        const current = doc.activeElement;
        if (!descendantOf(current, root))
            return;
        const action = focusAction(current);
        if (action)
            this.previous = { action, step };
    }
    /** Keyboard help may request its own toggle to receive focus after replacement. */
    prefer(action) {
        if (this.disposed)
            return;
        if (!ACTION_RE.test(action))
            throw new RangeError("Invalid focus action");
        this.preferred = action;
    }
    restore(root, step, heading) {
        if (this.disposed)
            return "none";
        const requested = this.preferred;
        this.preferred = null;
        const preserved = this.previous;
        this.previous = null;
        const action = requested ?? (preserved?.step === step ? preserved.action : null);
        if (action) {
            const target = matchingControl(root, action);
            if (target?.focus) {
                target.focus({ preventScroll: true });
                return "control";
            }
        }
        if (heading.focus) {
            heading.focus({ preventScroll: true });
            return "heading";
        }
        return "none";
    }
    dispose() {
        this.disposed = true;
        this.previous = null;
        this.preferred = null;
    }
}
