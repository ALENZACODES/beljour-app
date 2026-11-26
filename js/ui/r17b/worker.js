/** Dedicated local worker for the R17B studio. Author: John Khan. */
import { renderJob } from "./render.js";
self.onmessage = (event) => { const job = event.data.job; try {
    const result = renderJob(job);
    self.postMessage({ id: job.id, ok: true, result });
}
catch (error) {
    self.postMessage({ id: job.id, ok: false, error: error instanceof Error ? error.message : "render failed" });
} };
//# sourceMappingURL=worker.js.map