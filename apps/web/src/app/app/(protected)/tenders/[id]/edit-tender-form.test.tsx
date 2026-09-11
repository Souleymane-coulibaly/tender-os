import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Tender } from "../../../../../lib/tenders-types";
import { EditTenderForm } from "./edit-tender-form";

vi.mock("../../../actions", () => ({
  updateTenderAction: vi.fn(() => vi.fn(async (_prevState: unknown, _formData: FormData) => ({}))),
  createBuyerAction: vi.fn(() => vi.fn(async (_prevState: unknown, _formData: FormData) => ({}))),
}));

const BASE_TENDER: Tender = {
  id: "tender-1",
  organizationId: "org-1",
  clientAccountId: "client-1",
  title: "Maintenance et support informatique",
  reference: "AO-2026-001",
  buyerName: "Mairie de Lyon",
  procedureType: "OPEN",
  marketType: "PUBLIC",
  country: "FR",
  language: "fr",
  source: "MANUAL",
  estimatedAmount: "50000",
  currency: "EUR",
  submissionDeadline: "2026-09-30T00:00:00.000Z",
  status: "DRAFT",
  tags: [],
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
};

describe("EditTenderForm", () => {
  it("preloads every existing value, including the newly added business fields", () => {
    render(<EditTenderForm tender={BASE_TENDER} buyers={[]} />);

    expect(screen.getByLabelText("Titre *")).toHaveValue(BASE_TENDER.title);
    expect(screen.getByLabelText("Référence")).toHaveValue("AO-2026-001");
    expect(screen.getByLabelText("Acheteur (texte libre — compatibilite V1)")).toHaveValue("Mairie de Lyon");
    expect(screen.getByLabelText("Type de procédure")).toHaveValue("OPEN");
    expect(screen.getByLabelText("Type de marché *")).toHaveValue("PUBLIC");
    expect(screen.getByLabelText("Montant estimé")).toHaveValue("50000");
    expect(screen.getByLabelText("Date limite de remise")).toHaveValue("2026-09-30");
    expect(screen.getByLabelText("Pays *")).toHaveValue("FR");
    expect(screen.getByLabelText("Langue *")).toHaveValue("fr");
    expect(screen.getByLabelText("Devise *")).toHaveValue("EUR");
    expect(screen.getByLabelText("Source")).toHaveValue("MANUAL");
  });

  it("stays compatible with an older Tender missing the newer fields (never crashes, falls back to safe defaults)", () => {
    // exactOptionalPropertyTypes: les champs absents sont omis, jamais mis a `undefined`
    // explicitement (un Tender reel n'a jamais ces cles en JSON si le champ est absent).
    const legacyTender: Tender = {
      id: "tender-legacy",
      organizationId: "org-1",
      clientAccountId: "client-1",
      title: "Ancien appel d'offres (avant l'ajout des nouveaux champs)",
      status: "DRAFT",
      tags: [],
      createdBy: "user-1",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      version: 1,
    };

    render(<EditTenderForm tender={legacyTender} buyers={[]} />);

    expect(screen.getByLabelText("Pays *")).toHaveValue("FR");
    expect(screen.getByLabelText("Langue *")).toHaveValue("fr");
    expect(screen.getByLabelText("Devise *")).toHaveValue("EUR");
    expect(screen.getByLabelText("Type de marché *")).toHaveValue("PUBLIC");
    expect(screen.getByLabelText("Source")).toHaveValue("MANUAL");
    expect(screen.getByLabelText("Date limite de remise")).toHaveValue("");
  });

  it("keeps the Source select disabled and never renders any input (visible or hidden) named source", () => {
    // Correction securite : la source n'est jamais soumise depuis ce formulaire (voir
    // actions.ts) — aucun input, meme cache, ne doit porter ce nom, pour qu'aucune valeur
    // falsifiee ne puisse jamais etre envoyee au serveur.
    const { container } = render(<EditTenderForm tender={BASE_TENDER} buyers={[]} />);

    expect(screen.getByLabelText("Source")).toBeDisabled();
    expect(container.querySelector('[name="source"]')).toBeNull();
  });
});
