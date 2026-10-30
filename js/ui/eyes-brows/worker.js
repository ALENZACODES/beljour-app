/** Dedicated local CPU worker: never opens a URL. Author: John Khan. */
import { renderJob } from "./render.js";
const scope = globalThis;
scope.onmessage = (event) => {
    try {
        const result = renderJob(event.data);
        scope.postMessage({ id: event.data.id, ok: true, result }, [result.pixels.buffer]);
    }
    catch (error) {
        const message = error instanceof RangeError && error.message.length < 500 ? error.message : "The local preview could not be completed.";
        scope.postMessage({ id: event.data?.id, ok: false, message });
    }
};
//# sourceMappingURL=worker.js.map