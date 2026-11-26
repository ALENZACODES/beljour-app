export function localJudgeMock() {
    return {
        kind: "local-illustration",
        preview(intent) {
            if (!intent.localConsent || !intent.mockConsent || !intent.sourceReady) {
                return {
                    status: "missing-consent",
                    provider: "mock-only",
                    providerCalls: 0,
                    unitsSpent: 0,
                    sendsImage: false,
                    description: "Opt into the local illustration and mock action first.",
                };
            }
            if (!intent.subjectSelected) {
                return {
                    status: "missing-subject",
                    provider: "mock-only",
                    providerCalls: 0,
                    unitsSpent: 0,
                    sendsImage: false,
                    description: "A checked target is required; bystanders cannot be edited.",
                };
            }
            return {
                status: "illustrated",
                provider: "mock-only",
                providerCalls: 0,
                unitsSpent: 0,
                sendsImage: false,
                description: "A locally drawn accessory appeared. No provider request was made.",
            };
        },
    };
}
//# sourceMappingURL=judge-provider-mock.js.map