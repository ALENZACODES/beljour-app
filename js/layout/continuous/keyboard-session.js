export function editableKeyboardTarget(target) {
    if (!target || typeof target !== "object")
        return false;
    const node = target;
    if (node.isContentEditable)
        return true;
    const name = typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
    return name === "INPUT" || name === "SELECT" || name === "TEXTAREA";
}
/** No printable or arrow-key shortcut may take over a native editor control. */
export function keyboardDecision(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey
        || event.shiftKey || event.metaKey)
        return null;
    if (editableKeyboardTarget(event.target))
        return null;
    if (event.key === "F1")
        return "help";
    if (event.key === "Escape")
        return "exit";
    return null;
}
export class ContinuousKeyboardSession {
    open = false;
    disposed = false;
    target;
    onKey;
    callbacks;
    focus;
    constructor(target, callbacks, focus) {
        this.target = target;
        this.callbacks = callbacks;
        this.focus = focus;
        this.onKey = (raw) => {
            const event = raw;
            const decision = keyboardDecision(event);
            if (!decision || this.disposed)
                return;
            event.preventDefault();
            if (decision === "help") {
                this.toggleHelp();
            }
            else if (this.open) {
                this.closeHelp();
            }
            else {
                this.callbacks.exit();
            }
        };
        target.addEventListener("keydown", this.onKey);
    }
    get helpOpen() {
        return this.open;
    }
    toggleHelp() {
        if (this.disposed)
            return;
        this.open = !this.open;
        this.focus.prefer("keyboard-help");
        this.callbacks.changed();
    }
    closeHelp() {
        if (!this.open || this.disposed)
            return;
        this.open = false;
        this.focus.prefer("keyboard-help");
        this.callbacks.changed();
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.open = false;
        this.target.removeEventListener("keydown", this.onKey);
    }
}
//# sourceMappingURL=keyboard-session.js.map