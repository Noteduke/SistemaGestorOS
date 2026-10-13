export function maskPersonDocument(document: string | null): string | null {
  if (!document) return null;
  const lastTwo = document.slice(-2);
  if (document.length === 11) return `***.***.***-${lastTwo}`;
  if (document.length === 14) return `**.***.***/****-${lastTwo}`;
  return `••••${lastTwo}`;
}
