/** Truncate description for list cards. Full text stays on the detail page. */
export function previewDescription(text: string, maxWords = 75): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const words = cleaned.split(" ");
  if (words.length <= maxWords) return cleaned;
  return `${words.slice(0, maxWords).join(" ")}…`;
}
