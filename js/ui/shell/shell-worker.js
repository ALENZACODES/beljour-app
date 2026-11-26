import { serveShell } from "./worker-protocol.js";
const scope = self;
scope.onmessage = serveShell(scope);
//# sourceMappingURL=shell-worker.js.map