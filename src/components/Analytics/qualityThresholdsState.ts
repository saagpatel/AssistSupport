import {
  getResponseQualityThresholds,
  RESPONSE_QUALITY_THRESHOLDS_UPDATED_EVENT,
  type ResponseQualityThresholds,
} from "../../features/analytics/qualityThresholds";

export function readCurrentThresholds(): ResponseQualityThresholds {
  return getResponseQualityThresholds();
}

export function subscribeToQualityThresholds(
  onChange: (next: ResponseQualityThresholds) => void,
): () => void {
  const handler = () => onChange(getResponseQualityThresholds());
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener(RESPONSE_QUALITY_THRESHOLDS_UPDATED_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(
      RESPONSE_QUALITY_THRESHOLDS_UPDATED_EVENT,
      handler,
    );
    window.removeEventListener("storage", handler);
  };
}
