/** A UI boundary for unexpected screen failures, not a telemetry collector.
 * Never renders exception text, URLs, photo identifiers, or stack traces.
 */
import { LocalDiagnostics } from "../../diagnostics/errors.js";
export class ClientErrorState {
    count = 0;
    kind = "view";
    visible = false;
    disposed = false;
    listeners = new Set();
    get snapshot() {
        return { kind: this.kind, count: this.count, visible: this.visible };
    }
    show(kind) {
        if (this.disposed)
            return;
        this.count = Math.min(this.count + 1, 999);
        this.kind = kind;
        this.visible = true;
        this.changed();
    }
    dismiss() {
        if (this.disposed)
            return;
        this.visible = false;
        this.changed();
    }
    subscribe(listener) {
        if (this.disposed)
            return () => undefined;
        this.listeners.add(listener);
        listener(this.snapshot);
        return () => { this.listeners.delete(listener); };
    }
    destroy() {
        this.disposed = true;
        this.listeners.clear();
    }
    changed() {
        const snapshot = this.snapshot;
        for (const listener of this.listeners) {
            try {
                listener(snapshot);
            }
            catch {
                // Error reporting must not cause a second failure.
            }
        }
    }
}
/** Use the existing bounded local diagnostics, not a network reporter. */
export function mountErrorNotice(doc, events, onRetry) {
    const diagnostics = new LocalDiagnostics(20);
    const state = new ClientErrorState();
    const panel = doc.createElement("section");
    panel.className = "lg-client-error";
    panel.setAttribute("aria-label", "Application error");
    panel.hidden = true;
    const title = doc.createElement("strong");
    title.textContent = "A part of the page could not open";
    const description = doc.createElement("p");
    description.setAttribute("role", "alert");
    description.textContent = "Your photo and current edits have not been cleared. Try this view again or open another tool.";
    const actions = doc.createElement("div");
    actions.className = "lg-client-error-actions";
    const retry = doc.createElement("button");
    retry.className = "lg-client-retry";
    retry.type = "button";
    retry.textContent = "Try this view again";
    retry.hidden = !onRetry;
    retry.addEventListener("click", () => {
        state.dismiss();
        onRetry?.();
    });
    const dismiss = doc.createElement("button");
    dismiss.type = "button";
    dismiss.className = "lg-client-dismiss";
    dismiss.textContent = "Dismiss message";
    dismiss.addEventListener("click", () => state.dismiss());
    const home = doc.createElement("a");
    home.href = "home.html";
    home.textContent = "Go to Home";
    home.className = "lg-client-home-link";
    actions.append(retry, dismiss, home);
    panel.append(title, description, actions);
    const unsubscribe = state.subscribe((status) => {
        panel.hidden = !status.visible;
        panel.dataset.errorKind = status.kind;
        title.textContent = status.kind === "view"
            ? "A part of the page could not open"
            : "The page encountered an error";
    });
    /** Neither event details nor the rejected promise are inspected. */
    const rejected = () => {
        diagnostics.record("unhandled_rejection", "application");
        state.show("unhandled");
    };
    const failed = () => {
        diagnostics.record("script_error", "application");
        state.show("unhandled");
    };
    events.addEventListener("unhandledrejection", rejected);
    events.addEventListener("error", failed);
    return {
        element: panel,
        state,
        showViewError() {
            diagnostics.record("render_refused", "application");
            state.show("view");
        },
        dismiss() { state.dismiss(); },
        destroy() {
            unsubscribe();
            events.removeEventListener("unhandledrejection", rejected);
            events.removeEventListener("error", failed);
            state.destroy();
            diagnostics.clear();
            panel.remove();
        },
    };
}
//# sourceMappingURL=client-errors.js.map