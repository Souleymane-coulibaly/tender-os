import type { ConnectorProviderAdapter, ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import type { ConnectorProvider } from "../../domain/enums";

export function getAdapter(adapters: ConnectorProviderAdapterMap, provider: ConnectorProvider): ConnectorProviderAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`No ConnectorProviderAdapter registered for provider: ${provider}`);
  }
  return adapter;
}
