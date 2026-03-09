# Task Manager (Render + Supabase + Cloudinary)

This project is now configured for the stack you asked for:
- Hosting: Render free web service
- Database: Supabase Postgres
- File storage: Cloudinary
- Repo/CI: GitHub (+ GitHub Actions workflow)

## Tech
- Node.js + Express
- Supabase (`tasks` table)
- Cloudinary uploads for task attachments

## Environment variables
Copy `.env.example` to `.env` for local development and fill values.

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Optional:
- `PORT` (default: `3000`)
- `CLOUDINARY_FOLDER` (default: `taskmanager`)

## Supabase setup
1. Create a Supabase project.
2. Open SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy project URL and service role key into your environment variables.

## Local run
```bash
npm install
npm start
```

App runs at `http://localhost:3000`.

## Render deployment
This repo includes `render.yaml` for Blueprint deploy.

1. Push code to GitHub.
2. In Render, create a new Blueprint instance from the repo.
3. Set these environment variables in Render:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
4. Deploy.

## API summary
- `GET /api/health`
- `GET /api/tasks`
- `POST /api/tasks` with JSON `{ "text": "...", "priority": "high|medium|low", "due_date": "YYYY-MM-DD" }`
- `PATCH /api/tasks/:id` with JSON `{ "text": "updated text" }`
- `PATCH /api/tasks/:id/status` with JSON `{ "status": "pending|completed" }`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/attachment` with multipart field `file`
