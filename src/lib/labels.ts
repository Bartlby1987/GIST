/** Полное название статьи для подсказки при наведении. */
export function articleTooltip(doc: {
  title?: string;
  label?: string;
  url?: string;
}): string {
  const title = (doc.title ?? "").trim();
  const label = (doc.label ?? "").trim();
  const url = (doc.url ?? "").trim();

  if (title && title !== label) {
    return url ? `${title}\n${url}` : title;
  }
  return url || label || "";
}
