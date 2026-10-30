/** The five named commands are owned by Workstream H, not reimplemented here. */
export const PRO_COMMANDS = [
    "/IDENTITYLOCK",
    "/CLEANUP",
    "/UPSCALE",
    "/STUDIOQUALITY",
    "/POSEONLY",
];
export const PRO_COMMAND_INFO = [
    {
        name: "/IDENTITYLOCK",
        caption: "Preserve the selected person's identity while planning edits.",
        safety: "No identity guarantee without a verified engine response.",
    },
    {
        name: "/CLEANUP",
        caption: "Review dust, block and unwanted-mark repair.",
        safety: "No altered image is claimed while the command port is absent.",
    },
    {
        name: "/UPSCALE",
        caption: "Review bounded, locally generated enlargement.",
        safety: "Device memory and output checks must be confirmed separately.",
    },
    {
        name: "/STUDIOQUALITY",
        caption: "Review natural colour and tone correction.",
        safety: "It does not report an unmeasured improvement in image quality.",
    },
    {
        name: "/POSEONLY",
        caption: "Review a pose-only adjustment without changing the face.",
        safety: "No posture or identity score is inferred from a diagram.",
    },
];
export function recognizedProCommand(value) {
    return PRO_COMMANDS.some((name) => name === value);
}
/** Unknown is an honest absence of the public owner export, never a simulation of success. */
export function publicProCommands(port) {
    let catalog = [];
    if (port !== null) {
        if (port.kind !== "pro-command-catalogue")
            throw new TypeError("Unknown command port");
        catalog = port.listCommands();
        if (!Array.isArray(catalog) || catalog.length > 100) {
            throw new RangeError("Invalid command catalogue");
        }
        const names = new Set();
        for (const row of catalog) {
            if (!row || typeof row.name !== "string" || typeof row.available !== "boolean") {
                throw new TypeError("Invalid command catalogue entry");
            }
            if (names.has(row.name))
                throw new RangeError("Duplicate command name");
            names.add(row.name);
        }
    }
    return PRO_COMMAND_INFO.map((row) => {
        const match = catalog.find((entry) => entry.name === row.name);
        return {
            name: row.name,
            available: match ? (match.available ? "available" : "unavailable") : "unknown",
            caption: row.caption,
            safety: row.safety,
        };
    });
}
export function commandCoverage(rows) {
    const names = new Set();
    let known = 0;
    let available = 0;
    for (const row of rows) {
        if (!recognizedProCommand(row.name) || names.has(row.name)) {
            throw new RangeError("Invalid command coverage list");
        }
        names.add(row.name);
        if (row.available !== "unknown")
            known += 1;
        if (row.available === "available")
            available += 1;
    }
    return { known, available, full: names.size === 5 && available === 5 };
}
//# sourceMappingURL=pro-commands.js.map