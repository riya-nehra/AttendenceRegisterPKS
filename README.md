# Attendance Register PKS

A web-based attendance register for PKS classes/events. The app lets an admin create class/time categories, add names manually, bulk-add names, and extract names from an uploaded image using OCR. Viewers can select a date and category to see attendance records.

The app is built as a React + Vite frontend and stores attendance data in Firebase Cloud Firestore so the same data can sync across browsers/devices when deployed.

## What The App Does

- Shows attendance by selected date and class/category.
- Supports viewer and admin modes.
- Lets admins add, edit, and delete categories.
- Lets admins add single names or bulk names.
- Lets admins upload an image, crop the useful area, and read names from it using OCR.
- Saves data to Firebase Firestore when Firebase environment variables are configured.
- Falls back to browser `localStorage` if Firebase config is missing or Firestore is unavailable.

## Data Storage

Firestore stores the app data in a single document:

```text
attendanceRegisters/main
```

That document contains:

```js
{
  categories: [
    {
      id: "sarbat-da-bhala-class-1",
      name: "Sarbat Da Bhala Class 1",
      time: "2:30 AM - 3:10 AM",
      timesByDate: {
        "2026-06-03": "2:30 AM - 3:10 AM"
      },
      entries: [
        {
          id: "generated-id",
          date: "2026-06-03",
          name: "Person Name"
        }
      ]
    }
  ],
  updatedAt: "Firestore server timestamp"
}
```

The app listens to this document in real time using Firestore `onSnapshot`. When attendance changes, it writes the updated `categories` array back to the same document. A copy is also saved in `localStorage` as a local fallback/cache.

## Firebase Setup

The Firebase project currently used by this app is:

```text
pksattendance-dfa93
```

Required Firebase services:

- Firebase Web App
- Cloud Firestore

Firestore rules are stored in:

```text
firestore.rules
```

Deploy rules with:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

The current rules allow public read/write access to:

```text
attendanceRegisters/main
```

This is simple for a no-login attendance app, but it is not suitable for sensitive public production use. A future maintainer should add Firebase Authentication and restrict writes to trusted admins before widely sharing the app.

## Environment Variables

Local development uses a `.env` file. Do not commit `.env` to GitHub.

Use `.env.example` as the template:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

For Vite, every browser-exposed environment variable must start with `VITE_`. If the prefix is missing, the app will not receive the value.

## Vercel Environment Variables

To make Firebase sync work on the deployed Vercel site, add the same variables from local `.env` into Vercel.

Steps:

1. Open Vercel.
2. Select the attendance project.
3. Go to **Settings**.
4. Go to **Environment Variables**.
5. Add these variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

6. Save the variables for Production, Preview, and Development if needed.
7. Redeploy the project after adding or changing environment variables.

If the deployed app says it is using local browser storage, the Vercel environment variables are missing, misspelled, or the site has not been redeployed since adding them.

## Maintainer Notes

- Main app code is in `src/App.jsx`.
- Firebase initialization is in `src/firebase.js`.
- OCR/image-to-text uses `tesseract.js`.
- Firestore data is saved as one document, so large attendance history could eventually hit Firestore document size limits. If the app grows, split entries into separate documents by date/category.
- `.env` is intentionally ignored by Git in `.gitignore`.
- `dist/`, `node_modules/`, logs, and local env files should not be committed.
- After changing Firestore rules, run `npx firebase-tools deploy --only firestore:rules`.
- After changing Vercel env vars, redeploy the site.
- Run `npm run lint` and `npm run build` before important pushes.

## Local Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Tech Stack / Resume Notes

- React for the frontend UI.
- Vite for development server and production build tooling.
- Firebase Cloud Firestore for cloud-hosted real-time data storage.
- Firebase Web SDK for client-side Firestore connection.
- Firebase CLI for Firestore rules deployment.
- Vercel for web hosting/deployment.
- Tesseract.js for browser-based OCR/image-to-text extraction.
- Browser Canvas API for cropping uploaded images before OCR.
- localStorage for offline/fallback browser caching.
- ESLint for JavaScript/React code quality.
- Git and GitHub for version control and repository hosting.
