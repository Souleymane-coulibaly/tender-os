"use client";

import { useActionState } from "react";
import { createHumanResourceAction, createMaterialResourceAction, type FormActionState } from "../../../../company-profile-actions";
import type { CompanyHumanResource, CompanyMaterialResource } from "../../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};

export function ResourcesSection({
  clientId,
  humanResources,
  materialResources,
}: {
  clientId: string;
  humanResources: CompanyHumanResource[];
  materialResources: CompanyMaterialResource[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <HumanResourcesBlock clientId={clientId} resources={humanResources} />
      <MaterialResourcesBlock clientId={clientId} resources={materialResources} />
    </div>
  );
}

function HumanResourcesBlock({ clientId, resources }: { clientId: string; resources: CompanyHumanResource[] }) {
  const boundAction = createHumanResourceAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-neutral-900">Moyens humains</h3>
      {resources.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun moyen humain enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Catégorie</th>
                <th className="py-2 pr-4">Intitulé</th>
                <th className="py-2 pr-4">Effectif</th>
                <th className="py-2 pr-4">Qualification</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 text-neutral-600">{resource.category}</td>
                  <td className="py-2 pr-4 font-medium text-neutral-900">{resource.title}</td>
                  <td className="py-2 pr-4 text-neutral-600">{resource.headcount}</td>
                  <td className="py-2 pr-4 text-neutral-600">{resource.qualification ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="hr-category" className="text-xs text-neutral-600">
              Catégorie *
            </label>
            <input id="hr-category" name="category" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="hr-title" className="text-xs text-neutral-600">
              Intitulé *
            </label>
            <input id="hr-title" name="title" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="headcount" className="text-xs text-neutral-600">
              Effectif
            </label>
            <input id="headcount" name="headcount" type="number" min={1} defaultValue={1} className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="qualification" className="text-xs text-neutral-600">
              Qualification
            </label>
            <input id="qualification" name="qualification" className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {isPending ? "Ajout..." : "Ajouter"}
        </button>
      </form>
    </div>
  );
}

function MaterialResourcesBlock({ clientId, resources }: { clientId: string; resources: CompanyMaterialResource[] }) {
  const boundAction = createMaterialResourceAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-neutral-900">Moyens matériels</h3>
      {resources.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun moyen matériel enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Catégorie</th>
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Quantité</th>
                <th className="py-2 pr-4">Disponibilité</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 text-neutral-600">{resource.category}</td>
                  <td className="py-2 pr-4 font-medium text-neutral-900">{resource.name}</td>
                  <td className="py-2 pr-4 text-neutral-600">{resource.quantity}</td>
                  <td className="py-2 pr-4 text-neutral-600">{resource.availabilityStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="mr-category" className="text-xs text-neutral-600">
              Catégorie *
            </label>
            <input id="mr-category" name="category" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="mr-name" className="text-xs text-neutral-600">
              Nom *
            </label>
            <input id="mr-name" name="name" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="quantity" className="text-xs text-neutral-600">
              Quantité
            </label>
            <input id="quantity" name="quantity" type="number" min={1} defaultValue={1} className="rounded border border-neutral-300 px-2 py-1.5 text-sm" />
          </div>
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {isPending ? "Ajout..." : "Ajouter"}
        </button>
      </form>
    </div>
  );
}
