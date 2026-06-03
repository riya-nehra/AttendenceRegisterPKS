# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Firebase / Firestore setup

This app can sync attendance data to one Firestore document:

```text
attendanceRegisters/main
```

1. Create a Firebase project in the Firebase Console.
2. Add a Web App to that project.
3. Copy `.env.example` to `.env`.
4. Fill `.env` with the Firebase web app config values.
5. Enable Cloud Firestore in the Firebase Console.
6. Run the app with `npm run dev`.

The app will read/write Firestore when all `VITE_FIREBASE_*` values are present. If they are missing, it falls back to browser localStorage.

To deploy the included Firestore rules with the Firebase CLI:

```bash
npx firebase-tools login
npx firebase-tools use your-project-id
npx firebase-tools deploy --only firestore:rules
```

Current `firestore.rules` allow public read/write to `attendanceRegisters/main` so the no-login app works. Before sharing the app publicly, replace this with Firebase Auth-based rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
