# Noah Inventory List

Company equipment inventory web app built with React, Vite, Firebase Firestore, Firebase Auth, and Cloud Storage for Firebase.

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

## Firebase Setup

Create a `.env` file from `.env.example` and fill in the Firebase Web App config:

```bash
cp .env.example .env
```

Required variables:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ADMIN_EMAILS=admin1@company.com,admin2@company.com
```

If the Firebase variables are empty, the app runs in local demo mode with sample equipment.

## Firebase Collections

Equipment records are stored in:

```text
equipment
```

Settings are stored in:

```text
settings/inventoryOptions
```

The settings document shape:

```js
{
  categories: ['Camera', 'Lighting', 'Support'],
  locations: ['Equipment Room A', 'Studio Shelf 2']
}
```

Equipment document shape:

```js
{
  name: 'Sony FX3 Camera Kit',
  category: 'Camera',
  brand: 'Sony',
  model: 'FX3',
  quantity: 2,
  location: 'Equipment Room A',
  size: '129.7 x 77.8 x 84.5 mm',
  specs: 'Full-frame cinema camera, 4K 120p...',
  notes: 'Includes batteries and charger.',
  imageUrls: ['https://...', 'https://...', 'https://...'],
  imageUrl: 'https://...', // first image, kept for backward compatibility
  updatedAt: serverTimestamp()
}
```

## Auth And Storage

- General viewing does not require login.
- Settings, create, edit, delete, and image upload require admin login in the UI.
- Admin emails are configured with `VITE_ADMIN_EMAILS`.
- Each equipment item supports up to 3 images.
- Uploaded images are compressed in the browser to JPEG, maximum 1600px on the longest side, quality 0.78.
- Images upload to Cloud Storage under `equipment-images/`.

For production, also enforce the same admin rules in Firestore and Storage Security Rules. UI checks alone are not enough security.

Rule templates are included:

```text
firestore.rules
storage.rules
```

Replace the sample admin emails in those rule files before deploying rules.

## Build

```bash
npm run build
```

The production files are generated in `dist/`.
