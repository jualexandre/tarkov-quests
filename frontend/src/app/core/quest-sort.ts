export function sortByCompleted<T extends { completed: boolean }>(items: T[]): T[] {
  const incomplete = items.filter((item) => !item.completed);
  const completed = items.filter((item) => item.completed);
  return [...incomplete, ...completed];
}
