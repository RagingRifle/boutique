import { z } from 'zod';

export const customizationGroupsSchema = z.array(z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  selectionType: z.enum(['SINGLE', 'MULTIPLE']),
  required: z.boolean().default(false),
  options: z.array(z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    price: z.coerce.number().min(0),
  })).min(1).max(50),
})).max(30);

export const selectedCustomizationsSchema = z.array(z.object({
  groupId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).max(50),
})).max(30).optional();

export type CustomizationGroup = z.infer<typeof customizationGroupsSchema>[number];
export type SelectedCustomizationInput = NonNullable<z.infer<typeof selectedCustomizationsSchema>>[number];

type DbLike = {
  category: { findMany: (args: any) => Promise<any[]> };
};

/** Category groups are inherited from the root through the product's assigned category. */
export async function getEffectiveCustomizationGroups(db: DbLike, product: any): Promise<CustomizationGroup[]> {
  const categories = await db.category.findMany({
    select: { id: true, parentId: true, customizationGroups: true },
  });
  const byId = new Map<string, any>(categories.map(category => [category.id, category]));
  const path: any[] = [];
  let current = byId.get(product.categoryId);
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  const groups: CustomizationGroup[] = [];
  if (product.inheritCategoryCustomizations !== false) {
    for (const category of path.reverse()) {
      const parsed = customizationGroupsSchema.safeParse(category.customizationGroups ?? []);
      if (parsed.success) groups.push(...parsed.data);
    }
  }

  const productGroups = customizationGroupsSchema.safeParse(product.customizationGroups ?? []);
  if (productGroups.success) groups.push(...productGroups.data);
  return groups;
}

/** Validate submitted option IDs against the current configuration and snapshot their prices. */
export function resolveSelectedCustomizations(
  groups: CustomizationGroup[],
  submitted: SelectedCustomizationInput[] = [],
) {
  const byGroup = new Map(submitted.map(selection => [selection.groupId, selection.optionIds]));
  if (byGroup.size !== submitted.length) throw new Error('Duplicate customization groups were submitted.');

  const unknownGroup = submitted.find(selection => !groups.some(group => group.id === selection.groupId));
  if (unknownGroup) throw new Error('A selected customization is no longer available. Please review your choices.');

  let priceAdjustment = 0;
  const resolved = groups.flatMap(group => {
    const optionIds = byGroup.get(group.id) || [];
    if (new Set(optionIds).size !== optionIds.length) throw new Error(`Duplicate choices in ${group.name}.`);
    if (group.required && optionIds.length === 0) throw new Error(`Please choose an option for ${group.name}.`);
    if (group.selectionType === 'SINGLE' && optionIds.length > 1) throw new Error(`Choose only one option for ${group.name}.`);

    const selected = optionIds.map(optionId => {
      const option = group.options.find(candidate => candidate.id === optionId);
      if (!option) throw new Error(`A choice in ${group.name} is no longer available. Please review your choices.`);
      priceAdjustment += Number(option.price);
      return { optionId: option.id, name: option.name, price: Number(option.price) };
    });

    return selected.length ? [{ groupId: group.id, name: group.name, options: selected }] : [];
  });

  return { selectedCustomizations: resolved, priceAdjustment };
}
