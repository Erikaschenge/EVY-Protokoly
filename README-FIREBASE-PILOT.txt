EVY-Protokoly v0.5 Beta 2 - Firebase pilot

1. Firebase Console: vytvorte projekt.
2. Authentication > Sign-in method: povoľte Anonymous.
3. Firestore Database: vytvorte databázu Standard edition v zvolenom európskom regióne.
4. Storage: vytvorte bucket v rovnakom alebo vhodnom európskom regióne.
5. Project settings > Your apps > Web app: skopírujte firebaseConfig.
6. Hodnoty vložte do GitHub Actions secrets alebo do lokálneho .env podľa .env.example.
7. Nasadzujte firestore.rules a storage.rules cez Firebase CLI alebo ich vložte v konzole.

GitHub Actions musí počas buildu dostať tieto premenné:
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID

Pilot používa anonymné prihlásenie. Každý prihlásený používateľ má v tejto prvej pilotnej verzii spoločný prístup ku všetkým dátam. Nie je to finálny produkčný model rolí.
