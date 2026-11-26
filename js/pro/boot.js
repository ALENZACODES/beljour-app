/** Entry point referenced by the existing, owned recorder.html static page. */
import { mountProPanel } from "./panel.js";
const host = document.querySelector("[data-pro-studio]");
if (host) {
    const editor = mountProPanel(host);
    window.addEventListener("pagehide", () => editor.dispose(), { once: true });
}
//# sourceMappingURL=boot.js.map