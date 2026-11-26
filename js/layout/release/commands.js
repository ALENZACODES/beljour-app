/** Read-only adapter for the actual Pro Command catalogue. Author: John Khan. */
import { PRO_COMMANDS, publicProCommands, } from "../continuous/pro-commands.js";
export function commandReadiness(port) {
    try {
        const result = publicProCommands(port);
        const rows = result.map((command) => ({
            name: command.name,
            availability: command.available,
            operatorTested: false,
            independentResult: false,
            explanation: command.available === "available"
                ? "Available in the supplied owner catalogue; execution must still be face-tested."
                : command.available === "unavailable"
                    ? "The owner catalogue says this command is unavailable."
                    : "The public owner catalogue has not supplied availability.",
        }));
        return {
            status: port === null ? "absent" : "catalogue-read",
            rows,
            allAvailable: rows.length === PRO_COMMANDS.length
                && rows.every((row) => row.availability === "available"),
            productionVerified: false,
        };
    }
    catch {
        return {
            status: "invalid",
            rows: PRO_COMMANDS.map((name) => ({
                name,
                availability: "unknown",
                operatorTested: false,
                independentResult: false,
                explanation: "The supplied catalogue is invalid. No command is certified.",
            })),
            allAvailable: false,
            productionVerified: false,
        };
    }
}
export function commandsPending(result) {
    if (result.rows.length !== PRO_COMMANDS.length)
        throw new Error("Missing command rows");
    return result.rows.filter((row) => row.availability !== "available").length;
}
//# sourceMappingURL=commands.js.map