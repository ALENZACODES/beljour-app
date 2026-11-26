"use strict";
/**
 * Classic-worker entry for the face reader. MediaPipe Tasks Vision loads its WASM loader with
 * importScripts(), which a module worker does not allow ("Module scripts don't support
 * importScripts()"), so in a real browser the face reader never started and every lens fell back
 * to the example pictures' fixed framing. This file is started as a classic worker, where
 * importScripts works, and loads the module code (media-worker.js) with a dynamic import.
 * Messages that arrive while it loads are held and replayed in order. Author: John Khan.
 */
const scope = self;
const early = [];
const hold = (event) => { early.push(event); };
scope.addEventListener("message", hold);
import("./media-worker.js").then(() => {
    scope.removeEventListener("message", hold);
    for (const event of early.splice(0))
        scope.dispatchEvent(new MessageEvent("message", { data: event.data }));
}, (error) => {
    // Surface the failure as a worker error, which the client already turns into a refusal.
    setTimeout(() => { throw error instanceof Error ? error : new Error(String(error)); });
});
//# sourceMappingURL=media-worker-boot.js.map