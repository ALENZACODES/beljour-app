/** A Stop control for long work on this device (several photos, a clip, a batch).
 *
 * begin() starts a run and enables the button; the run's AbortSignal is aborted when she taps
 * Stop, when a newer run begins or when the panel is disposed. Work checks `signal.aborted`
 * between steps and ends quietly; end() disables the button again. The button stays in the
 * page while idle (disabled), so its place does not jump when work starts.
 * Author: John Khan.
 */
import { h } from "../dom.js";
export class LongWork {
    onStop;
    button;
    controller = null;
    constructor(label, onStop = () => { }) {
        this.onStop = onStop;
        this.button = h("button", { type: "button", class: "btn btn-quiet", disabled: true }, label);
        this.button.addEventListener("click", () => this.stop());
    }
    /** Start a run; any earlier run is aborted. */
    begin() {
        this.controller?.abort();
        this.controller = new AbortController();
        this.button.disabled = false;
        return this.controller.signal;
    }
    /** Finish the run that owns `signal`; a newer run keeps the button enabled. */
    end(signal) {
        if (this.controller?.signal === signal) {
            this.controller = null;
            this.button.disabled = true;
        }
    }
    /** She tapped Stop (or the panel closed): abort the current run and say so once. */
    stop() {
        if (!this.controller)
            return;
        this.controller.abort();
        this.controller = null;
        this.button.disabled = true;
        this.onStop();
    }
    get running() { return this.controller !== null; }
}
