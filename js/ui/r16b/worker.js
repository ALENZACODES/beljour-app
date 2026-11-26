/** Dedicated local R16B CPU worker. Author: John Khan. */
import { renderJob } from "./render.js";
const scope = globalThis;
scope.onmessage = e => {
    try {
        const result = renderJob(e.data);
        scope.postMessage({ id: e.data.id, ok: true, result }, [result.pixels.buffer]);
    }
    catch (error) {
        scope.postMessage({ id: e.data?.id, ok: false, message: error instanceof Error ? error.message : "Local preview failed." });
    }
};
//# sourceMappingURL=worker.js.map