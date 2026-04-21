import { useCallback, useEffect, useState } from "react";
import {
  useAnalytics,
  type AnalyticsSummary,
  type ArticleUsage,
  type LowRatingAnalysis,
  type ResponseQualityDrilldownExamples,
  type ResponseQualitySummary,
} from "../../hooks/useAnalytics";
import { useInsightsOps } from "../../hooks/useInsightsOps";
import type { KbGapCandidate } from "../../types/insights";

export type AnalyticsPeriod = 7 | 30 | 90 | null;

export interface UseAnalyticsLoaderResult {
  summary: AnalyticsSummary | null;
  kbUsage: ArticleUsage[];
  qualitySummary: ResponseQualitySummary | null;
  qualityDrilldown: ResponseQualityDrilldownExamples | null;
  lowRatingData: LowRatingAnalysis | null;
  gapCandidates: KbGapCandidate[];
  loading: boolean;
  error: string | null;
  period: AnalyticsPeriod;
  setPeriod: (p: AnalyticsPeriod) => void;
  reload: () => Promise<void>;
  updateGapStatus: (
    id: string,
    status: "accepted" | "resolved" | "ignored",
  ) => Promise<void>;
}

export function useAnalyticsLoader(): UseAnalyticsLoaderResult {
  const {
    getSummary,
    getKbUsage,
    getLowRatingAnalysis,
    getResponseQualitySummary,
    getResponseQualityDrilldownExamples,
  } = useAnalytics();
  const { getKbGapCandidates, updateKbGapStatus } = useInsightsOps();

  const [period, setPeriod] = useState<AnalyticsPeriod>(30);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [qualitySummary, setQualitySummary] =
    useState<ResponseQualitySummary | null>(null);
  const [qualityDrilldown, setQualityDrilldown] =
    useState<ResponseQualityDrilldownExamples | null>(null);
  const [kbUsage, setKbUsage] = useState<ArticleUsage[]>([]);
  const [lowRatingData, setLowRatingData] = useState<LowRatingAnalysis | null>(
    null,
  );
  const [gapCandidates, setGapCandidates] = useState<KbGapCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        summaryData,
        kbData,
        lowRating,
        qualityData,
        qualityDrilldownData,
      ] = await Promise.all([
        getSummary(period ?? undefined),
        getKbUsage(period ?? undefined),
        getLowRatingAnalysis(period ?? undefined).catch(() => null),
        getResponseQualitySummary(period ?? undefined).catch(() => null),
        getResponseQualityDrilldownExamples(period ?? undefined, 6).catch(
          () => null,
        ),
      ]);
      const gaps = await getKbGapCandidates(12, "open").catch(() => []);
      setSummary(summaryData);
      setQualitySummary(qualityData);
      setQualityDrilldown(qualityDrilldownData);
      setKbUsage(kbData);
      setLowRatingData(lowRating);
      setGapCandidates(gaps);
    } catch (err) {
      console.error("Failed to load analytics:", err);
      setError(typeof err === "string" ? err : "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [
    period,
    getSummary,
    getKbUsage,
    getLowRatingAnalysis,
    getResponseQualitySummary,
    getResponseQualityDrilldownExamples,
    getKbGapCandidates,
  ]);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateGapStatus = useCallback(
    async (id: string, status: "accepted" | "resolved" | "ignored") => {
      await updateKbGapStatus(id, status);
      setGapCandidates((prev) => prev.filter((g) => g.id !== id));
    },
    [updateKbGapStatus],
  );

  return {
    summary,
    kbUsage,
    qualitySummary,
    qualityDrilldown,
    lowRatingData,
    gapCandidates,
    loading,
    error,
    period,
    setPeriod,
    reload,
    updateGapStatus,
  };
}
