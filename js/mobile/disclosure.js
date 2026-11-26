/** Two simple, non-modal disclosures: mobile menu and optional tools panel.
 * Focus stays in normal document order, rather than trapping the editor behind a dialog.
 */
import { moveNavFocus } from "./keyboard.js";
import { watchCompact } from "./viewport.js";
export function within(node, ancestor) {
    let current = node;
    while (current) {
        if (current === ancestor)
            return true;
        current = current.parentNode;
    }
    return false;
}
export function makeDisclosure(parts, doc, viewport) {
    let compact = false;
    let expanded = false;
    let toolsExpanded = false;
    let disposed = false;
    const menu = (value) => {
        expanded = value;
        parts.panel.dataset.open = value ? "true" : "false";
        parts.trigger.setAttribute("aria-expanded", String(value));
        parts.trigger.setAttribute("aria-label", value ? "Close navigation" : "Open navigation");
    };
    const tools = (value) => {
        toolsExpanded = value;
        parts.toolsPanel.dataset.open = value ? "true" : "false";
        parts.toolsButton.setAttribute("aria-expanded", String(value));
    };
    const open = () => {
        if (disposed)
            return;
        menu(true);
        const first = parts.topLinks[0];
        first?.focus();
    };
    const closeTools = (restoreFocus = false) => {
        if (!toolsExpanded)
            return;
        tools(false);
        if (restoreFocus)
            parts.toolsButton.focus();
    };
    const close = (restoreFocus = false) => {
        if (disposed)
            return;
        closeTools();
        if (!expanded)
            return;
        menu(false);
        if (restoreFocus && compact)
            parts.trigger.focus();
    };
    const openTools = () => {
        if (disposed)
            return;
        if (compact && !expanded)
            menu(true);
        tools(true);
        parts.toolsPanel.querySelector("a")?.focus();
    };
    const toggleMenu = () => {
        if (expanded)
            close(true);
        else
            open();
    };
    const toggleTools = () => {
        if (toolsExpanded)
            closeTools(true);
        else
            openTools();
    };
    const keys = (raw) => {
        const event = raw;
        if (event.key === "Escape") {
            if (toolsExpanded) {
                closeTools(true);
                event.preventDefault();
            }
            else if (expanded) {
                close(true);
                event.preventDefault();
            }
            return;
        }
        if (within(event.target, parts.panel)) {
            moveNavFocus(event, parts.topLinks);
        }
    };
    const outside = (event) => {
        if (!within(event.target, parts.root)) {
            close();
        }
    };
    const followed = (event) => {
        const target = event.target;
        let current = target;
        while (current && current !== parts.panel) {
            if (current instanceof Element && current.tagName === "A") {
                close();
                return;
            }
            current = current.parentNode;
        }
    };
    parts.trigger.addEventListener("click", toggleMenu);
    parts.toolsButton.addEventListener("click", toggleTools);
    parts.panel.addEventListener("click", followed);
    doc.addEventListener("keydown", keys);
    doc.addEventListener("pointerdown", outside);
    const stopViewport = watchCompact(viewport, (nowCompact) => {
        compact = nowCompact;
        menu(false);
        tools(false);
    });
    menu(false);
    tools(false);
    return {
        get expanded() { return expanded; },
        get toolsExpanded() { return toolsExpanded; },
        open,
        close,
        openTools,
        closeTools,
        destroy() {
            if (disposed)
                return;
            close();
            disposed = true;
            stopViewport();
            parts.trigger.removeEventListener("click", toggleMenu);
            parts.toolsButton.removeEventListener("click", toggleTools);
            parts.panel.removeEventListener("click", followed);
            doc.removeEventListener("keydown", keys);
            doc.removeEventListener("pointerdown", outside);
        },
    };
}
//# sourceMappingURL=disclosure.js.map