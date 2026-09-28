# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## API deployment

The frontend calls the same-origin `/api/*` routes. Vercel serves these through the Express function in `api/[...path].js`; the Express server uses the existing `students` table and private `results` storage bucket for student registration.

Set these variables in the Vercel project environment (Production and Preview as needed):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only; never use a `VITE_` prefix.
- `SUPABASE_PUBLISHABLE_KEY` — used by the backend's isolated student sign-in client. This is the public/publishable key, not the service-role key.
- `FRONTEND_ORIGIN` — optional comma-separated origins only if the frontend calls the API from a different origin. Same-origin deployments do not need it.

Before deploying, apply `supabase/migrations/20260928180000_add_student_registration_fields.sql` in the Supabase SQL Editor. It only adds the `spi_cgpi` column required by the registration form. Student passwords are managed by Supabase Auth; registration uses the existing `enrollment_no`, `course`, `email`, and `resume_url` columns and the existing private `results` bucket.

For local backend development, put `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_PUBLISHABLE_KEY` in `backend/.env` (the backend also loads the frontend's root `.env.local`), then run `npm start --prefix backend`. Run `npm run build` from the project root to build the frontend.
