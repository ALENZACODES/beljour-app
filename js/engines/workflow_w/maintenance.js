function parseDate(value) { const date = new Date(`${value}T00:00:00Z`); if (Number.isNaN(date.getTime()))
    throw new RangeError("date must be ISO YYYY-MM-DD"); return date; }
function iso(date) { return date.toISOString().slice(0, 10); }
function addDays(date, days) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }
export function maintenanceSchedule(start, service, intervalWeeks, count = 8, flexibilityDays = 7) { if (!service || service.length > 80)
    throw new RangeError("service required"); if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > 104)
    throw new RangeError("intervalWeeks outside range"); if (!Number.isInteger(count) || count < 1 || count > 24)
    throw new RangeError("count outside range"); if (!Number.isInteger(flexibilityDays) || flexibilityDays < 0 || flexibilityDays > 31)
    throw new RangeError("flexibilityDays outside range"); const base = parseDate(start); return Array.from({ length: count }, (_, index) => { const due = addDays(base, index * intervalWeeks * 7); return { index, due: iso(due), earliest: iso(addDays(due, -flexibilityDays)), latest: iso(addDays(due, flexibilityDays)), service, estimate: true, completed: false }; }); }
export function markMaintenanceComplete(rows, index) { if (index < 0 || index >= rows.length)
    throw new RangeError("maintenance index outside range"); return rows.map(row => ({ ...row, completed: row.completed || row.index === index })); }
export function upcomingMaintenance(rows, today) { const now = parseDate(today).getTime(), eligible = rows.filter(row => !row.completed && parseDate(row.latest).getTime() >= now).sort((a, b) => parseDate(a.due).getTime() - parseDate(b.due).getTime()); return eligible[0] ?? null; }
export function maintenanceExport(rows) { return { schema: "beljour.maintenance-calendar.v1", items: rows.map(row => ({ ...row })), network: false, label: "estimated local maintenance calendar" }; }
//# sourceMappingURL=maintenance.js.map