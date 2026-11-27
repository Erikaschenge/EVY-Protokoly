# Zoznam súborov – v0.6.0-alpha.4

## Nové súbory
- .prettierrc
- src/vite-env.d.ts
- src/components/Field.tsx, Photos.tsx, Shell.tsx, ui.tsx
- src/lib/errors.ts, hooks.ts, ids.ts, images.ts, protocolImportParser.ts, protocolLogic.ts,
  saveTracker.ts, templateDefaults.ts, worker.ts
- src/lib/protocolLogic.test.ts, protocolImportParser.test.ts
- src/pages/Dashboard.tsx, NewSet.tsx, Packages.tsx, PrintView.tsx, ProtocolPage.tsx,
  SetDetail.tsx, TemplateEditor.tsx, Templates.tsx

## Zmenené súbory
- .github/workflows/deploy-pages.yml – typová kontrola, testy, `npm ci` pri existencii lockfile
- CHANGELOG.md, README.md, FILE-MANIFEST.md
- firebase.json – len pravidlá (nasadenie stránky ide cez GitHub Pages)
- firestore.rules – podkolekcia protokolov, `counters`, `system`
- package.json, tsconfig.json, vite.config.ts
- src/App.tsx – iba smerovanie a ErrorBoundary
- src/dictionaries.ts, src/templates.ts – formátovanie, typy
- src/firebase.ts – offline cache, spoľahlivé prihlásenie aj offline
- src/main.tsx
- src/repository.ts
- src/services/protocolImport.ts, src/services/uploadQueue.ts
- src/pages/FindingsPage.tsx
- src/styles.css – doplnené štýly na konci súboru
- src/types.ts

## Odstránené súbory
- env.example (duplicita .env.example)
- README-FIREBASE-PILOT.txt, README-v0.5-beta1.txt, README-v0.5-beta2.1.txt (obsah presunutý do README.md)
- src/models/v5-domain.ts, src/repositories/storage.ts, src/services/findingNumber.ts (nepoužívané)
- src/components/README.md, src/pages/README.md, src/styles/README.md

## Nezmenené súbory
- .env.example, .firebaserc.example, .gitignore, index.html, storage.rules
- public/EVY-Predloha-importu-protokolu.xlsx, public/zos-trnava-logo.png
