# Automated Ground Truth Generator (NestJS)

This project now includes a NestJS implementation of the original Python pipeline.
It processes PDF and DOCX files into ground-truth blocks and supports a Swagger-based
completion model endpoint.

## NestJS Features
- **Classic pipeline:** DOCX/PDF extraction and block segmentation (`====` markers).
- **LLM pipeline:** Calls completion service through `/api/v1/completions`.
- **Web UI + API:** Upload file, run `classic` / `llm` / `compare`, then download output.
- **Completion client contract:** Uses the same message/body shape as `completion-service.client.ts`.

## Completion Service
Default completion URL:

`https://completion-service.stg.jeenai.app/api/v1/completions`

Override with:

- `COMPLETIONS_API_URL` (base or full `/api/v1/completions` URL)
- `COMPLETIONS_MODEL` (default: `gpt-4o`)

No token is required unless your environment enforces auth.

## Run NestJS version
1. Install Node.js + npm.
2. Install dependencies:
   - `npm install`
3. Run server:
   - `npm run start:dev`
4. Open:
   - `http://localhost:8000`

## Notes
- Existing Python files are kept in the repo for reference/migration safety.
- OCR route in the NestJS classic path is currently a placeholder and returns no OCR text.
