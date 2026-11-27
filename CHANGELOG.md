# CHANGELOG

## v0.6.0-alpha.4
Opravy z revízie kódu. Prihlásenie (anonymné) a model oprávnení zostávajú bez zmeny.

### Ukladanie a dáta
- Protokoly sú v podkolekcii `trainsets/{id}/protocols`; súprava drží len prehľad `protocolIndex`.
  Odstraňuje riziko limitu 1 MiB a prepisovania práce kolegov na inej časti súpravy.
- Odpovede sa ukladajú po jednotlivých poliach (nie celý dokument) a textové polia s oneskorením,
  nie pri každom stlačení klávesu. Neuložená zmena sa uloží aj pri opustení poľa či stránky.
- Fotografie v protokoloch sa už neodosielajú opakovane pri každom uložení; zmenšujú sa v zariadení
  a idú cez offline frontu rovnako ako v evidencii chýb.
- Zapnutá offline cache Firestore; indikátor v hlavičke ukazuje Ukladám / Uložené / Offline / Chyba.
- Chyby čítania aj zápisu sa vždy zobrazia; neexistujúci záznam zobrazí hlásenie namiesto nekonečného načítavania.
- Mazanie súpravy, vozidla, protokolu, chyby a fotografie maže aj súbory v Storage.
  Mazanie súpravy odstráni aj jej evidované chyby (s potvrdením a rekapituláciou).
- Automatický prevod súprav zo staršieho formátu.

### Protokoly a šablóny
- Import z Excelu podporuje oficiálnu predlohu (hárok „Polia“) aj starší formát; chyby hlási s číslom riadka.
- Typ Defektoskopia (NDT) sa dá vyplniť po kusoch (metóda + výsledok); ukážková NDT šablóna sa dá uzatvoriť.
- Opakované body (počet opakovaní) sa rozbalia na samostatné polia.
- Editor šablón: všetky typy polí, tolerancia (cieľ, −/+), rozsah, hranice, možnosti výberu,
  metódy NDT, stav 0/1, povinnosť, N/A, pomocný text, číslo bodu, validácia pred uložením.
- Neúplné pravidlo sa nevyhodnotí ako NOK; porovnanie desatinných čísel je tolerantné na zaokrúhlenie.
- Každý protokol má kópiu šablóny – úprava alebo zmazanie šablóny nemení existujúce protokoly.
- Uzatvorený protokol je zamknutý; opätovné otvorenie vyžaduje dôvod a zapíše sa do histórie.
- Meradlá: zadávanie v protokole, kontrola pri režime „Povinné“, tlač v protokole.
- Prázdny text sa nepočíta ako vyplnený bod; povinné fotografie sa kontrolujú aj pri nepovinných bodoch s NOK.
- Tlač: nameraná hodnota s jednotkou, predpis, výsledok, meradlá, kto vyplnil/uzatvoril, dátum,
  miesto na podpis, fotodokumentácia, číslovanie strán.
- Úprava zákazky pracuje s konceptom – „Zrušiť úpravy“ zmeny naozaj zahodí.

### Evidencia chýb
- Číslo TK-RR-NNNN sa prideľuje pri uložení atomicky (transakcia nad počítadlom) – bez duplicít.
- Fotografie sa dajú odstrániť; nevznikajú duplicitné ani stratené fotografie.
- Meno pracovníka (zadané v hlavičke, uložené v zariadení) sa zapisuje do histórie;
  odstránenie nemôže overiť ten istý pracovník, ktorý ho vykonal.

### Technické
- Kód rozdelený do `pages/`, `components/`, `lib/`; odstránený mŕtvy kód a cyklický import.
- Pevné verzie závislostí (namiesto `latest`), `xlsx` 0.20.3 z oficiálneho zdroja SheetJS (oprava zraniteľností).
- `npm run build` spúšťa typovú kontrolu; pridané unit testy (Vitest) a Prettier; CI spúšťa kontrolu aj testy.
- Ovládanie: zvýraznený zvolený stav OK/NOK, viditeľný fokus, `alt` texty, desatinná čiarka pri meraniach.
