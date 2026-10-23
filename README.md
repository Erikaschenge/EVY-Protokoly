# Digitálne protokoly ŽKV – pilot

Konfigurovateľný pilot pre rôzne kontrolné, meracie, výrobné a skúšobné protokoly železničných vozidiel.

## Čo obsahuje v0.1
- domovskú obrazovku,
- novú a rozpracovanú kontrolu,
- priebežné lokálne ukladanie,
- 4 rozdielne pilotné šablóny,
- OK/NOK/N/A, text, dátum/čas, výber, NDT výsledok,
- numerické rozsahy a tolerancie s automatickým vyhodnotením,
- opakovateľné polia,
- fotografovanie nezhôd,
- históriu.

## Spustenie
```bash
npm install
npm run dev
```

Aplikácia bez `.env` funguje v **lokálnom pilotnom režime** cez `localStorage`. Firebase konfigurácia je pripravená, produkčný repozitár Firestore/Storage sa doplní v ďalšom kroku.

## Firebase
1. Skopírujte `.env.example` na `.env` a doplňte Firebase Web App config.
2. Skopírujte `.firebaserc.example` na `.firebaserc` a doplňte project ID.
3. Zapnite Authentication, Firestore, Storage a Hosting.
4. Nasaďte pravidlá a hosting:
```bash
npm run build
npx firebase-tools deploy
```

## Dôležité
Firebase/GitHub je určený pre pilot. Firemná produkčná verzia má mať schválenú infraštruktúru, identitu, audit, zálohovanie a retention politiku.
