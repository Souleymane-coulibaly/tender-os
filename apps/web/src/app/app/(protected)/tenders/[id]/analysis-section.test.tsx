import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisSection } from "./analysis-section";
import type { AnalysisSectionData } from "../../../../../lib/analysis-types";

const fetchAnalysisSectionData = vi.fn(async (_tenderId: string) => EMPTY_DATA);
const startTenderAnalysisAction = vi.fn(async (_tenderId: string) => ({}) as { error?: string });
const retryAnalysisAction = vi.fn(async (_tenderId: string, _analysisId: string) => ({}) as { error?: string });

vi.mock("../../../analysis-actions", () => ({
  fetchAnalysisSectionData: (tenderId: string) => fetchAnalysisSectionData(tenderId),
  startTenderAnalysisAction: (tenderId: string) => startTenderAnalysisAction(tenderId),
  retryAnalysisAction: (tenderId: string, analysisId: string) => retryAnalysisAction(tenderId, analysisId),
}));

const EMPTY_PAGE = { items: [], total: 0, limit: 50, offset: 0 };

const EMPTY_DATA: AnalysisSectionData = {
  latestJob: null,
  jobHistoryCount: 0,
  summary: null,
  deadlines: EMPTY_PAGE,
  criteria: EMPTY_PAGE,
  requirements: EMPTY_PAGE,
  clauses: EMPTY_PAGE,
  risks: EMPTY_PAGE,
  questions: EMPTY_PAGE,
};

function withJob(overrides: Partial<NonNullable<AnalysisSectionData["latestJob"]>>): AnalysisSectionData {
  return {
    ...EMPTY_DATA,
    latestJob: {
      id: "job-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      scope: "TENDER",
      status: "PENDING",
      analysisVersion: 1,
      promptVersion: 1,
      attemptCount: 0,
      createdAt: "2026-07-30T10:00:00.000Z",
      updatedAt: "2026-07-30T10:00:00.000Z",
      ...overrides,
    },
  };
}

describe("AnalysisSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty states and a launch button when no analysis has ever run", () => {
    render(<AnalysisSection tenderId="tender-1" initialData={EMPTY_DATA} canTrigger={true} />);

    expect(screen.getByText("Aucune analyse lancee")).toBeInTheDocument();
    expect(screen.getByText("Aucune synthese disponible pour le moment.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lancer l'analyse" })).toBeInTheDocument();
  });

  it("hides the launch button when canTrigger is false", () => {
    render(<AnalysisSection tenderId="tender-1" initialData={EMPTY_DATA} canTrigger={false} />);

    expect(screen.queryByRole("button", { name: "Lancer l'analyse" })).not.toBeInTheDocument();
  });

  it("calls startTenderAnalysisAction then refreshes when Lancer l'analyse is clicked", async () => {
    const user = userEvent.setup();
    fetchAnalysisSectionData.mockResolvedValueOnce(withJob({ status: "QUEUED" }));
    render(<AnalysisSection tenderId="tender-1" initialData={EMPTY_DATA} canTrigger={true} />);

    await user.click(screen.getByRole("button", { name: "Lancer l'analyse" }));

    expect(startTenderAnalysisAction).toHaveBeenCalledWith("tender-1");
    expect(await screen.findByText("En file d'attente")).toBeInTheDocument();
  });

  it("shows a running message and no launch/retry buttons while PROCESSING", () => {
    render(<AnalysisSection tenderId="tender-1" initialData={withJob({ status: "PROCESSING" })} canTrigger={true} />);

    expect(screen.getByText("En cours")).toBeInTheDocument();
    expect(screen.getByText(/Analyse en cours de traitement/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lancer l'analyse" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Relancer" })).not.toBeInTheDocument();
  });

  it("shows the error code and a Relancer button when the last analysis FAILED, and retries it", async () => {
    const user = userEvent.setup();
    fetchAnalysisSectionData.mockResolvedValueOnce(withJob({ status: "QUEUED" }));
    render(
      <AnalysisSection
        tenderId="tender-1"
        initialData={withJob({ status: "FAILED", errorCode: "AI_PROVIDER_NOT_CONFIGURED" })}
        canTrigger={true}
      />,
    );

    expect(screen.getByText("Echouee — AI_PROVIDER_NOT_CONFIGURED")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Relancer" });
    await user.click(retryButton);

    expect(retryAnalysisAction).toHaveBeenCalledWith("tender-1", "job-1");
    expect(await screen.findByText("En file d'attente")).toBeInTheDocument();
  });

  it("renders the consolidated summary with the non-binding disclaimer, always visible", () => {
    const data: AnalysisSectionData = {
      ...withJob({ status: "SUCCEEDED" }),
      summary: {
        analysisVersion: 1,
        opportunitySummary: "Marche de nettoyage, complexite moderee.",
        complexityLevel: "MEDIUM",
        mainCriteria: ["Prix (60%)"],
        mainRisks: ["Delai court"],
        mainObligations: ["Memoire technique obligatoire"],
        missingElements: ["Format du DPGF non precise"],
        pointsToClarify: ["Format du DPGF"],
        conflicts: [],
        goNoGoRecommendation: "GO_WITH_RESERVATIONS",
        goNoGoRationale: "Coherent malgre un delai court.",
        createdAt: "2026-07-30T10:00:00.000Z",
      },
    };
    render(<AnalysisSection tenderId="tender-1" initialData={data} canTrigger={true} />);

    expect(screen.getByText("Marche de nettoyage, complexite moderee.")).toBeInTheDocument();
    expect(screen.getByText("Favorable avec reserves")).toBeInTheDocument();
    expect(screen.getByText("Complexite : Moyenne")).toBeInTheDocument();
    expect(screen.getByText(/non contraignante/)).toBeInTheDocument();
    expect(screen.getByText("Format du DPGF non precise")).toBeInTheDocument();
  });

  it("renders findings with their provenance (citation, page, confidence) inside each category", () => {
    const data: AnalysisSectionData = {
      ...EMPTY_DATA,
      risks: {
        items: [
          {
            id: "risk-1",
            title: "Delai de reponse court",
            category: "PLANNING",
            severity: "HIGH",
            explanation: "Le delai entre publication et remise est court.",
            recommendation: "Prioriser la redaction du memoire technique.",
            citation: "remise des offres sous 3 semaines",
            pageStart: 2,
            isInferred: false,
            confidence: 0.75,
            createdAt: "2026-07-30T10:00:00.000Z",
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
        analysisVersion: 1,
      },
    };
    render(<AnalysisSection tenderId="tender-1" initialData={data} canTrigger={true} />);

    expect(screen.getByText("Risques (1)")).toBeInTheDocument();
    expect(screen.getByText("Delai de reponse court")).toBeInTheDocument();
    expect(screen.getByText(/remise des offres sous 3 semaines/)).toBeInTheDocument();
    expect(screen.getByText(/confiance 75%/)).toBeInTheDocument();
  });

  it("renders clauses with their category and provenance", () => {
    const data: AnalysisSectionData = {
      ...EMPTY_DATA,
      clauses: {
        items: [
          {
            id: "clause-1",
            category: "PENALTY",
            summary: "Penalites de retard de 1/1000e par jour.",
            citation: "penalites de retard",
            isInferred: false,
            confidence: 0.7,
            createdAt: "2026-07-30T10:00:00.000Z",
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
        analysisVersion: 1,
      },
    };
    render(<AnalysisSection tenderId="tender-1" initialData={data} canTrigger={true} />);

    expect(screen.getByText("Clauses contractuelles (1)")).toBeInTheDocument();
    expect(screen.getByText("PENALTY")).toBeInTheDocument();
    expect(screen.getByText("Penalites de retard de 1/1000e par jour.")).toBeInTheDocument();
    expect(screen.getByText(/penalites de retard/)).toBeInTheDocument();
  });

  it("flags an inferred finding explicitly instead of presenting it as a direct citation", () => {
    const data: AnalysisSectionData = {
      ...EMPTY_DATA,
      deadlines: {
        items: [
          { id: "d-1", kind: "SUBMISSION", label: "Remise des offres", rawText: "sous 3 semaines", isInferred: true, confidence: 0.4, createdAt: "" },
        ],
        total: 1,
        limit: 50,
        offset: 0,
        analysisVersion: 1,
      },
    };
    render(<AnalysisSection tenderId="tender-1" initialData={data} canTrigger={true} />);

    expect(screen.getByText("Deduit")).toBeInTheDocument();
  });

  it("calls fetchAnalysisSectionData and updates the view when Actualiser is clicked", async () => {
    const user = userEvent.setup();
    fetchAnalysisSectionData.mockResolvedValueOnce(withJob({ status: "SUCCEEDED" }));
    render(<AnalysisSection tenderId="tender-1" initialData={EMPTY_DATA} canTrigger={true} />);

    await user.click(screen.getByRole("button", { name: "Actualiser" }));

    expect(fetchAnalysisSectionData).toHaveBeenCalledWith("tender-1");
    expect(await screen.findByText("Terminee")).toBeInTheDocument();
  });
});
