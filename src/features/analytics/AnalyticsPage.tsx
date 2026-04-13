import { AnalyticsTab } from "../../components/Analytics/AnalyticsTab";

interface AnalyticsPageProps {
  initialSection?: "overview" | "pilot";
}

export function AnalyticsPage({ initialSection }: AnalyticsPageProps) {
  return <AnalyticsTab initialSection={initialSection} />;
}
