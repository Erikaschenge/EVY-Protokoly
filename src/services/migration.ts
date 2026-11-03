export function ensureV4Migration(): MigrationReport | undefined {
  const existingReport =
    storage.read<MigrationReport | undefined>(REPORT, undefined);

  if (localStorage.getItem(MARKER) === "1") {
    return existingReport;
  }

  const oldTemplateRaw = raw(V4_TEMPLATES);
  const oldTrainsetRaw = raw(V4_TRAINSETS);

  const oldTemplates = safeArray(oldTemplateRaw);
  const oldTrainsets = safeArray(oldTrainsetRaw);

  const currentTemplates =
    storage.read<ProtocolTemplate[]>(V5_TEMPLATES, []);

  const currentTrainsets =
    storage.read<Trainset[]>(V5_TRAINSETS, []);

  const templateIds =
    new Set(currentTemplates.map(x => x.id));

  const trainsetIds =
    new Set(currentTrainsets.map(x => x.id));

  const importedTemplates =
    oldTemplates
      .map(normalizeTemplate)
      .filter(x => !templateIds.has(x.id));

  const importedTrainsets =
    oldTrainsets
      .map(normalizeTrainset)
      .filter(x => !trainsetIds.has(x.id));

  try {
    if (importedTemplates.length) {
      storage.write(
        V5_TEMPLATES,
        [...currentTemplates, ...importedTemplates]
      );
    }

    if (importedTrainsets.length) {
      storage.write(
        V5_TRAINSETS,
        [...currentTrainsets, ...importedTrainsets]
      );
    }
  } catch (error) {
    console.error("Migrácia zlyhala:", error);

    const report: MigrationReport = {
      completedAt: new Date().toISOString(),
      templatesFound: oldTemplates.length,
      templatesImported: 0,
      trainsetsFound: oldTrainsets.length,
      trainsetsImported: 0,
      protocolsImported: 0,
      skippedDuplicates: 0,
      backupKeys: []
    };

    storage.write(REPORT, report);

    throw new Error(
      "Nedostatok miesta v LocalStorage. Dáta z v0.4 sú príliš veľké pre automatickú migráciu."
    );
  }

  const report: MigrationReport = {
    completedAt: new Date().toISOString(),
    templatesFound: oldTemplates.length,
    templatesImported: importedTemplates.length,
    trainsetsFound: oldTrainsets.length,
    trainsetsImported: importedTrainsets.length,
    protocolsImported:
      importedTrainsets.reduce(
        (sum, x) => sum + x.protocols.length,
        0
      ),
    skippedDuplicates:
      (oldTemplates.length - importedTemplates.length) +
      (oldTrainsets.length - importedTrainsets.length),

    backupKeys: []
  };

  storage.write(REPORT, report);
  localStorage.setItem(MARKER, "1");

  return report;
}
