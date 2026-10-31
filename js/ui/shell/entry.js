/** Static editor entry point. No API health call, no model download and no fetch.
 * Layout v1 adds its editor chrome (top bar Save and Trust, strength slider, categories,
 * tags, face picker, My Look) on top of the R8/R9 studio. */
import { mountClientShell } from "../../layout/client-shell.js";
import { mountShell } from "./view.js";
import { mountChrome } from "../../layout/editor-chrome.js";
import { mountOfflineTools } from "../../offline/install.js";
import { mountSessionTools } from "../session-tools.js";
import { installColourGpu } from "../../editor/adjust/gpu.js";
// Photo adjustments run their colour pass on the GPU when this device has WebGL2 (CPU otherwise).
installColourGpu();
let shellClient = mountClientShell(document, window, { page: "studio" });
const shell = mountShell();
mountChrome(shell);
const stopSessionTools = mountSessionTools(shell.editor, () => shell.draw());
const stopOfflineTools = mountOfflineTools(() => shell.editor.document.layers.length > 0);
window.addEventListener("pagehide", () => {
    stopSessionTools();
    stopOfflineTools();
    shellClient.destroy();
}, { once: true });
// R15 Workstream B standalone local studio; no shared compositing changes. Author: John Khan.
import { installEyesBrowsLink } from "../eyes-brows/install.js";
installEyesBrowsLink(document.querySelector(".shell-top-links"));
window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        shellClient = mountClientShell(document, window, { page: "studio" });
    }
});
