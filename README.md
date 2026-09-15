# GIST Map

Production-ready Next.js app that fetches **real web pages**, embeds them, runs a GIST-style diversity/utility selection, and visualizes exclusion bubbles.

## What it does

1. Downloads your page + competitor URLs (server-side, no CORS issues)
2. Extracts main text + headings
3. Builds embeddings (`OPENAI_API_KEY` → OpenAI; otherwise local hashed BoW)
4. Runs greedy independent-set selection with a distance radius
5. Projects documents to a 2D map and reports overlap / gaps

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional:

```bash
cp .env.example .env.local
# add OPENAI_API_KEY=sk-...
```

## Deploy on Vercel

```bash
npx vercel --prod
```

Optionally set `OPENAI_API_KEY` in the Vercel project environment variables.

## API

`POST /api/analyze`

```json
{
  "query": "google gist algorithm",
  "yourUrl": "https://example.com/your-post",
  "competitorUrls": ["https://example.com/a", "https://example.com/b"],
  "radius": 0.42,
  "k": 4
}
```

Or send `yourText` instead of `yourUrl`.

## Note

This implements the **practical idea** behind GIST sampling for content strategy. It is not Google's production ranking system.
