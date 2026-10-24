type CreatedTemplate = {
  id: string;
  createdAt: string;
};

function compareCreatedAtDescThenId(left: CreatedTemplate, right: CreatedTemplate) {
  const leftCreatedAt = Date.parse(left.createdAt);
  const rightCreatedAt = Date.parse(right.createdAt);
  const timeDifference =
    (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) -
    (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0);
  if (timeDifference !== 0) return timeDifference;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

export function sortTemplates<T extends CreatedTemplate>(items: T[]) {
  return [...items].sort(compareCreatedAtDescThenId);
}

export function sortCatalogItems<T extends CreatedTemplate>(items: T[]) {
  return [...items].sort(compareCreatedAtDescThenId);
}
