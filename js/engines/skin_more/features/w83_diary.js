/** W83 local skin-observation diary orchestration. Author: John Khan. */
import { diarySummary, diaryTrend, serialiseDiary } from "../diary_secure.js";
export function assessW83(entries, field = "dryness") { const summary = diarySummary(entries), trend = diaryTrend(entries, field); return { entries: summary.entries, predictive: false, diagnosis: false, trendPoints: trend.points, trendSlope: trend.slope, passed: summary.predictive === false, copy: "Local self-observation only. Patterns are descriptive and never fertility or medical predictions." }; }
export function exportW83(entries, consent) { return serialiseDiary(entries, consent); }
export const passDefinitionW83 = "explicit consent for import/export, local-only descriptive data, no fertility or medical prediction";
//# sourceMappingURL=w83_diary.js.map