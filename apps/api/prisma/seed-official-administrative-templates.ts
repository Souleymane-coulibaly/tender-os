import "reflect-metadata";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { CLOCK, type Clock } from "../src/shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../src/shared-kernel/id-generator";
import { CreateDocumentWithFirstVersionUseCase, DocumentDomain, DocumentOrigin } from "../src/modules/documents";
import { AdministrativeFormType } from "../src/modules/administrative-dossier/domain/administrative-form-type";
import { OfficialAdministrativeTemplate } from "../src/modules/administrative-dossier/domain/official-administrative-template.aggregate";
import {
  OFFICIAL_ADMINISTRATIVE_TEMPLATE_REPOSITORY,
  type OfficialAdministrativeTemplateRepository,
} from "../src/modules/administrative-dossier/application/ports/official-administrative-template.repository";

/**
 * Sprint 8C.1 — script de seed CONTRÔLÉ (mission "pas d'interface d'administration de gabarits
 * cette passe") : enregistre les 4 formulaires officiels DAJ (DC1/DC2/DC4/ATTRI1) tels que
 * téléchargés, OCTET POUR OCTET, jamais reconstruits ni convertis. Réutilise EXACTEMENT le même
 * mécanisme de stockage que tout document déposé par un acteur (`CreateDocumentWithFirstVersionUseCase`)
 * — jamais un second chemin d'écriture binaire.
 *
 * Usage (exécution manuelle, jamais automatique — mission "aucun téléchargement Internet au moment
 * de la génération") :
 *   pnpm.cmd --filter @tenderos/api exec ts-node prisma/seed-official-administrative-templates.ts \
 *     --organizationId=<uuid réel> --actorId=<uuid réel d'un utilisateur ayant DocumentPermission.Create> \
 *     --actorRole=<rôle réel> \
 *     --dc1=<chemin local vers DC1-2019.doc> --dc2=<chemin vers Formulaire_DC2.doc> \
 *     --dc4=<chemin vers DC4.docx> --attri1=<chemin vers ATTRI1-2019.doc>
 *
 * Chaque argument de fichier est optionnel — seuls les types fournis sont importés. Un import
 * répété pour le même (organizationId, documentType) désactive l'ancienne version active avant de
 * créer la nouvelle (mission "jamais un remplacement en place") ; l'index unique partiel côté DB
 * reste le garde-fou final si deux exécutions se chevauchent.
 */

type FormTypeArgKey = "dc1" | "dc2" | "dc4" | "attri1";

const FORM_TYPE_BY_ARG_KEY: Record<FormTypeArgKey, AdministrativeFormType> = {
  dc1: AdministrativeFormType.Dc1,
  dc2: AdministrativeFormType.Dc2,
  dc4: AdministrativeFormType.Dc4,
  attri1: AdministrativeFormType.Attri1,
};

const OFFICIAL_NAME_BY_ARG_KEY: Record<FormTypeArgKey, string> = {
  dc1: "DC1 — Lettre de candidature",
  dc2: "DC2 — Déclaration du candidat",
  dc4: "DC4 — Déclaration de sous-traitance",
  attri1: "ATTRI1 — Acte d'engagement (ancien formulaire DC3)",
};

const SOURCE_REFERENCE_BY_ARG_KEY: Record<FormTypeArgKey, string> = {
  dc1: "https://www.economie.gouv.fr/files/files/directions_services/daj/marches_publics/formulaires/DC/imprimes_dc/DC1-2019.doc",
  dc2: "https://www.economie.gouv.fr/files/files/directions_services/daj/marches_publics/formulaires/DC/imprimes_dc/Formulaire_DC2.doc",
  dc4: "https://www.economie.gouv.fr/files/files/directions_services/daj/marches_publics/formulaires/DC/imprimes_dc/DC4_2023_Duree_contrat_sous_traitance.docx",
  attri1: "https://www.economie.gouv.fr/files/files/directions_services/daj/marches_publics/formulaires/ATTRI/imprimes_attri/ATTRI1-2019.doc",
};

function parseArgs(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    // Checkpoint TENDEROS-2.1-POST-DECOM-TNR3 — le motif d'origine n'acceptait que des LETTRES
    // (`[a-zA-Z]+`) : aucun des quatre arguments de fichier documentes par l'en-tete de ce script
    // (`--dc1`, `--dc2`, `--dc4`, `--attri1`) ne pouvait donc etre reconnu, et le script echouait
    // systematiquement sur "No template file provided" meme correctement invoque. Les chiffres
    // sont desormais acceptes dans le NOM de l'argument.
    const match = /^--([a-zA-Z][a-zA-Z0-9]*)=(.+)$/.exec(arg);
    if (match?.[1] && match[2]) result[match[1]] = match[2];
  }
  return result;
}

function mimeTypeForFile(filePath: string): string {
  if (filePath.toLowerCase().endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (filePath.toLowerCase().endsWith(".doc")) return "application/msword";
  throw new Error(`Unsupported official template file extension: ${filePath}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const organizationId = args.organizationId;
  const actorId = args.actorId;
  const actorRole = args.actorRole;
  if (!organizationId || !actorId || !actorRole) {
    throw new Error("Missing required arguments: --organizationId=<uuid> --actorId=<uuid> --actorRole=<role>");
  }

  const filesByArgKey: Partial<Record<FormTypeArgKey, string>> = {
    dc1: args.dc1,
    dc2: args.dc2,
    dc4: args.dc4,
    attri1: args.attri1,
  };
  const entries = (Object.entries(filesByArgKey) as [FormTypeArgKey, string | undefined][]).filter((entry): entry is [FormTypeArgKey, string] => Boolean(entry[1]));
  if (entries.length === 0) {
    throw new Error("No template file provided — pass at least one of --dc1/--dc2/--dc4/--attri1.");
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const createDocumentUseCase = app.get(CreateDocumentWithFirstVersionUseCase);
    const officialTemplateRepository = app.get<OfficialAdministrativeTemplateRepository>(OFFICIAL_ADMINISTRATIVE_TEMPLATE_REPOSITORY);
    const clock = app.get<Clock>(CLOCK);
    const idGenerator = app.get<IdGenerator>(ID_GENERATOR);

    for (const [argKey, filePath] of entries) {
      const documentType = FORM_TYPE_BY_ARG_KEY[argKey];
      const buffer = readFileSync(filePath);
      const hash = createHash("sha256").update(buffer).digest("hex");
      const mimeType = mimeTypeForFile(filePath);
      const originalFilename = filePath.split(/[/\\]/).pop() ?? filePath;

      const documentSummary = await createDocumentUseCase.execute({
        organizationId,
        actorId,
        actorRole,
        title: `${OFFICIAL_NAME_BY_ARG_KEY[argKey]} (gabarit officiel DAJ)`,
        origin: DocumentOrigin.Imported,
        domain: DocumentDomain.Template,
        category: documentType,
        file: { buffer, originalFilename, mimeType },
        maxFileSizeBytes: 20 * 1024 * 1024,
      });

      if (!documentSummary.currentVersion) {
        throw new Error(`Document ${documentSummary.id} was created without a current version — unexpected state.`);
      }

      const occurredAt = clock.now();
      const existingActive = await officialTemplateRepository.findActiveForOrganization({ organizationId, documentType });
      if (existingActive) {
        existingActive.deactivate(occurredAt);
        await officialTemplateRepository.save(existingActive);
      }

      const template = OfficialAdministrativeTemplate.create({
        id: idGenerator.generate(),
        organizationId,
        documentType,
        officialName: OFFICIAL_NAME_BY_ARG_KEY[argKey],
        version: (existingActive?.version ?? 0) + 1,
        sourceAuthority: "DAJ",
        sourceReference: SOURCE_REFERENCE_BY_ARG_KEY[argKey],
        fileDocumentId: documentSummary.id,
        fileDocumentVersionId: documentSummary.currentVersion.id,
        hash,
        createdBy: actorId,
        occurredAt,
      });
      await officialTemplateRepository.create(template);

      console.log(`Imported ${documentType} — OfficialAdministrativeTemplate ${template.id} (Document ${documentSummary.id}, sha256 ${hash}).`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
