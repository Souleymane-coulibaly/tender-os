import { Inject, Injectable, Logger } from "@nestjs/common";
import { GetCurrentUserUseCase } from "../../../identity";
import { MEMBERSHIP_REPOSITORY, OrganizationRole, type MembershipRepository } from "../../../memberships";
import { EMAIL_PROVIDER, type EmailProvider } from "../../application/ports/email-provider";
import { CreateNotificationUseCase } from "../../application/use-cases/create-notification.use-case";

export type NotifyBillingInput = Readonly<{
  organizationId: string;
  type: string;
  title: string;
  body?: string | undefined;
  targetUrl?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
}>;

const ORGANIZATION_BILLING_MANAGEMENT_ROLES: readonly OrganizationRole[] = [OrganizationRole.Owner, OrganizationRole.OrganizationAdmin];

/**
 * V2 Sprint 22 (billing, étape 22E) — même motif que `WorkspaceEventNotificationService` (Sprint
 * 18) : point d'entrée UNIQUE réutilisant STRICTEMENT l'infrastructure Notification/Email
 * existante, jamais un second pipeline. Deux formes de destinataire (décision utilisateur,
 * AskUserQuestion) :
 *  - `notifyUser` — un acteur précis, réutilisé tel quel pour les événements qui EN ont un
 *    (`PassConsumedForTender`, déclenché par l'utilisateur qui vient de créer le Tender) ;
 *  - `notifyOrganizationBillingManagers` — événements SANS acteur applicatif évident (déclenchés
 *    par un webhook Stripe, ou par Platform Admin qui n'est pas membre de l'organisation) :
 *    notifie OWNER + ORGANIZATION_ADMIN uniquement (mêmes rôles qu'`assertCanManageBilling`),
 *    jamais tous les membres.
 */
@Injectable()
export class BillingEventNotificationService {
  private readonly logger = new Logger(BillingEventNotificationService.name);

  constructor(
    private readonly createNotificationUseCase: CreateNotificationUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async notifyUser(input: NotifyBillingInput & { userId: string }): Promise<void> {
    await this.deliver(input, input.userId);
  }

  async notifyOrganizationBillingManagers(input: NotifyBillingInput): Promise<void> {
    const now = new Date();
    // Correctif audit Codex 22E (P2) — filtre par rôle AU NIVEAU REQUÊTE (`listActiveByOrganization
    // AndRoles`), jamais une pagination générique de tous les membres suivie d'un filtre applicatif :
    // un OWNER/ORGANIZATION_ADMIN ajouté après les N premiers membres d'une grande organisation
    // n'était alors jamais retrouvé (`listByOrganization` paginée + filtre après coup).
    const members = await this.membershipRepository.listActiveByOrganizationAndRoles({
      organizationId: input.organizationId,
      roles: ORGANIZATION_BILLING_MANAGEMENT_ROLES,
    });
    const managers = members.filter((membership) => membership.isEffectivelyActive(now));
    for (const manager of managers) {
      await this.deliver(input, manager.userId);
    }
  }

  private async deliver(input: NotifyBillingInput, userId: string): Promise<void> {
    await this.createNotificationUseCase.execute({
      organizationId: input.organizationId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      targetUrl: input.targetUrl,
      metadata: input.metadata,
    });

    try {
      const user = await this.getCurrentUserUseCase.execute({ userId });
      await this.emailProvider.send({ to: user.email, subject: input.emailSubject, html: input.emailHtml, text: input.emailText });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Email delivery failed for notification type=${input.type} userId=${userId}: ${message}`);
    }
  }
}
