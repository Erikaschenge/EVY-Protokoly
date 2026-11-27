/** Zrozumiteľná slovenská správa z chyby Firebase alebo prehliadača. */
export function errorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
  switch (code) {
    case 'permission-denied':
    case 'storage/unauthorized':
      return 'Server zápis odmietol. Skontrolujte, či sú vo Firebase nasadené aktuálne pravidlá firestore.rules a storage.rules.';
    case 'unavailable':
      return 'Server je nedostupný. Skontrolujte pripojenie na internet a skúste to znova.';
    case 'failed-precondition':
      return 'Operáciu nemožno vykonať bez pripojenia na internet.';
    case 'not-found':
      return 'Záznam sa na serveri nenašiel. Mohol ho medzitým odstrániť iný používateľ.';
    case 'resource-exhausted':
      return 'Bol prekročený limit Firebase. Skúste to neskôr.';
    case 'storage/quota-exceeded':
      return 'Úložisko fotografií je plné.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Operácia sa nepodarila.';
}

export const errorCode = (error: unknown) =>
  typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
