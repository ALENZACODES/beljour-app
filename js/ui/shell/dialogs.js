/** Modal dialogs for the studio: consent, the styling transfer and the shortcuts list.
 *
 * While a dialog is open the rest of the page is inert (not focusable, not read), Tab stays in
 * the dialog, Escape closes it, and focus goes back to the control that opened it.
 * Author: John Khan.
 */
import { focusables, trap } from "./focus.js";
export class Modal {
    dialog;
    scrim;
    background;
    cancelValue;
    release = null;
    resolve = null;
    returnTo = null;
    constructor(dialog, scrim, background, cancelValue) {
        this.dialog = dialog;
        this.scrim = scrim;
        this.background = background;
        this.cancelValue = cancelValue;
        if (dialog.tabIndex < 0 && !dialog.hasAttribute("tabindex"))
            dialog.tabIndex = -1;
        dialog.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.close(this.cancelValue);
            }
        });
        scrim.addEventListener("click", () => this.close(this.cancelValue));
    }
    get isOpen() { return !this.dialog.hidden; }
    /** Show the dialog and wait for close(value). `first` gets focus, else the first control. */
    open(first) {
        if (this.isOpen)
            this.close(this.cancelValue);
        this.returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        this.dialog.hidden = false;
        this.scrim.hidden = false;
        for (const el of this.background)
            el.inert = true;
        this.release = trap(this.dialog);
        (first ?? focusables(this.dialog)[0] ?? this.dialog).focus();
        return new Promise((resolve) => { this.resolve = resolve; });
    }
    close(value) {
        if (!this.isOpen)
            return;
        this.dialog.hidden = true;
        this.scrim.hidden = true;
        for (const el of this.background)
            el.inert = false;
        this.release?.();
        this.release = null;
        const done = this.resolve;
        this.resolve = null;
        if (this.returnTo?.isConnected)
            this.returnTo.focus();
        done?.(value);
    }
}
