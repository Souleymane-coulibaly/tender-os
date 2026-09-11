import type { ComponentType } from "react";
import {
  BookIcon,
  BriefcaseIcon,
  BuildingIcon,
  CheckCircleIcon,
  CoinsIcon,
  CreditCardIcon,
  DashboardIcon,
  FolderIcon,
  NetworkIcon,
  PlugIcon,
  SignalIcon,
  SparklesIcon,
  TargetIcon,
  TenderIcon,
  UsersIcon,
  type IconProps,
} from "../../../components/ui/icons";
import type { NavIconName } from "./nav-sections";

/** Clé du menu → pictogramme. La liste du menu (`nav-sections.ts`) ne porte qu'une clé, jamais un
 *  composant : elle reste de la donnée pure, transmissible du serveur au navigateur. */
const NAV_ICONS: Record<NavIconName, ComponentType<IconProps>> = {
  dashboard: DashboardIcon,
  tenders: TenderIcon,
  opportunities: TargetIcon,
  watch: SignalIcon,
  validations: CheckCircleIcon,
  documents: FolderIcon,
  knowledge: BookIcon,
  clients: BriefcaseIcon,
  companies: BuildingIcon,
  subcontractors: NetworkIcon,
  subscription: CreditCardIcon,
  members: UsersIcon,
  integrations: PlugIcon,
  ai: SparklesIcon,
  costs: CoinsIcon,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = NAV_ICONS[name];
  return <Icon className={className} />;
}
