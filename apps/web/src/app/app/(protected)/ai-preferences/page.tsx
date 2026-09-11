import { permanentRedirect } from "next/navigation";

/** « IA / Modèles » a rejoint Configuration IA (onglet « Choix des modèles ») : l'ancienne adresse
 *  reste valable pour les favoris et liens existants. */
export default function AiPreferencesRedirectPage(): never {
  permanentRedirect("/app/ai-configuration/model-preferences");
}
