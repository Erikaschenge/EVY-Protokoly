# Digitálne protokoly ŽKV – pilot

Pilotná webová aplikácia pre kontrolné, meracie, výrobné a skúšobné protokoly železničných vozidiel
a pre evidenciu chýb vozňov. Beží na GitHub Pages, údaje ukladá do Firebase (Firestore + Storage).

> **Pilot bez citlivých dát.** Prihlásenie je anonymné a každý prihlásený používateľ má prístup ku
> všetkým údajom. Pred produkčným nasadením je potrebné firemné prihlásenie a pravidlá podľa rolí.

## Funkcie
- súpravy/zákazky s vozidlami a balíkmi protokolov,
- vyplňovanie protokolov: OK/NOK/N/A, merania s automatickým vyhodnotením (rozsah, tolerancia, hranice),
  text, výber, dátum/čas, stav 0/1, defektoskopia (NDT) po kusoch, opakované body,
- fotografie (zmenšené v zariadení, nahrávané cez offline frontu),
- priebežné ukladanie s indikátorom stavu a offline režimom,
- uzatvorenie protokolu so zámkom, opätovné otvorenie s dôvodom a históriou,
- každý protokol má kópiu šablóny z času vytvorenia (neskoršie úpravy šablóny ho nemenia),
- tlačový výstup s nameranými hodnotami, meradlami, podpismi a fotodokumentáciou,
- import šablóny z Excelu (predloha `public/EVY-Predloha-importu-protokolu.xlsx`),
- evidencia chýb s číslovaním TK-RR-NNNN, workflow opravy a overenia a históriou.

## Vývoj
```bash
npm install          # prvýkrát – vytvorí package-lock.json, ten commitnite
npm run dev
npm run typecheck
npm test
npm run build
```
Kód formátujte cez `npm run format` (Prettier).

Štruktúra `src/`:
- `pages/` – obrazovky, `components/` – spoločné prvky (Shell, Field, fotografie),
- `lib/` – čistá logika bez Firebase (vyhodnocovanie, validácia, import) + testy,
- `repository.ts` – všetky zápisy a čítania z Firebase, `services/` – fronta fotografií a import Excelu.

## Firebase
1. Firebase Console: vytvorte projekt, povoľte **Authentication → Anonymous**, vytvorte Firestore
   (Standard, európsky región) a Storage.
2. Hodnoty z *Project settings → Your apps → Web app* vložte do GitHub Actions secrets
   (`VITE_FIREBASE_*`) alebo do lokálneho `.env` podľa `.env.example`.
3. **Nasaďte pravidlá** (nutné pri každej zmene `firestore.rules` / `storage.rules`):
   ```bash
   cp .firebaserc.example .firebaserc   # doplňte project ID
   npx firebase-tools deploy --only firestore:rules,storage
   ```
4. Push do vetvy `main` spustí typovú kontrolu, testy, build a nasadenie na GitHub Pages.

## Model údajov (Firestore)
| Kolekcia | Obsah |
|---|---|
| `templates/{id}` | šablóny protokolov |
| `protocolPackages/{id}` | balíky (záložky) protokolov |
| `trainsets/{id}` | súprava, vozidlá a `protocolIndex` – ľahký prehľad protokolov |
| `trainsets/{id}/protocols/{pid}` | protokol: odpovede, meradlá, história, kópia šablóny |
| `findings/{id}` | evidované chyby |
| `counters/findings-RR` | počítadlo čísel chýb pre rok RR |
| `system/seed` | značka, že ukážkové šablóny už boli vložené |

Súpravy zo staršej verzie (protokoly vnútri dokumentu súpravy) sa pri prvom otvorení automaticky
prevedú do podkolekcie `protocols`.
