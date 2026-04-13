import { useEffect, useState } from "react";
import { KnowledgeBrowser } from "../../components/Knowledge";
import { HybridSearchTab } from "../../components/Search";
import { Button } from "../../components/shared/Button";
import { SourcesPage } from "../sources";
import "./KnowledgePage.css";

type KnowledgeSection = "documents" | "library" | "diagnostics";

interface KnowledgePageProps {
  initialSearchQuery?: string | null;
  onSearchQueryConsumed?: () => void;
}

const SECTION_COPY: Record<
  KnowledgeSection,
  { title: string; description: string }
> = {
  documents: {
    title: "Documents",
    description:
      "Manage indexed files, rebuild the KB, and search source content from one place.",
  },
  library: {
    title: "Library",
    description:
      "Inspect namespaces, documents, chunk health, and destructive actions without leaving Knowledge.",
  },
  diagnostics: {
    title: "Search Diagnostics",
    description:
      "Run hybrid search checks, inspect ranking quality, and submit search-result feedback.",
  },
};

export function KnowledgePage({
  initialSearchQuery = null,
  onSearchQueryConsumed,
}: KnowledgePageProps) {
  const [activeSection, setActiveSection] =
    useState<KnowledgeSection>("documents");

  useEffect(() => {
    if (initialSearchQuery) {
      setActiveSection("documents");
    }
  }, [initialSearchQuery]);

  const copy = SECTION_COPY[activeSection];
  const showToolPanel = activeSection !== "documents";

  return (
    <div className="knowledge-page">
      <header className="knowledge-page__header">
        <div>
          <h2>Knowledge</h2>
          <p>{copy.description}</p>
        </div>
        <div
          className="knowledge-page__sectionPicker"
          role="tablist"
          aria-label="Knowledge sections"
        >
          {(["documents", "library", "diagnostics"] as const).map((section) => (
            <Button
              key={section}
              type="button"
              variant={activeSection === section ? "primary" : "secondary"}
              size="small"
              role="tab"
              aria-selected={activeSection === section}
              onClick={() => setActiveSection(section)}
            >
              {SECTION_COPY[section].title}
            </Button>
          ))}
        </div>
      </header>

      <section
        className="knowledge-page__documentsSurface"
        aria-label="Knowledge documents workspace"
      >
        <SourcesPage
          initialSearchQuery={initialSearchQuery}
          onSearchQueryConsumed={onSearchQueryConsumed ?? (() => {})}
        />
      </section>

      {showToolPanel ? (
        <section
          className="knowledge-page__toolSurface"
          aria-label={SECTION_COPY[activeSection].title}
        >
          <div className="knowledge-page__toolHeader">
            <div>
              <h3>{SECTION_COPY[activeSection].title}</h3>
              <p>{SECTION_COPY[activeSection].description}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="small"
              onClick={() => setActiveSection("documents")}
            >
              Back to Documents
            </Button>
          </div>

          {activeSection === "library" ? (
            <KnowledgeBrowser />
          ) : (
            <HybridSearchTab />
          )}
        </section>
      ) : (
        <section
          className="knowledge-page__toolIntro"
          aria-label="Knowledge tools"
        >
          <div className="knowledge-page__toolIntroCard">
            <h3>Library inspection</h3>
            <p>
              Open namespace, document, and chunk inspection tools when you need
              to audit or clean up knowledge data.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => setActiveSection("library")}
            >
              Open Library
            </Button>
          </div>
          <div className="knowledge-page__toolIntroCard">
            <h3>Search diagnostics</h3>
            <p>
              Run hybrid search diagnostics and feedback checks without leaving
              the main Knowledge workspace.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => setActiveSection("diagnostics")}
            >
              Open Search Diagnostics
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
