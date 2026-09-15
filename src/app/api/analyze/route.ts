import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeContent } from "@/lib/analyze";

export const maxDuration = 60;
export const runtime = "nodejs";

const bodySchema = z.object({
  query: z.string().max(200).optional(),
  yourUrl: z.union([z.string().url(), z.literal("")]).optional(),
  yourText: z.string().max(50000).optional(),
  yourLabel: z.string().max(80).optional(),
  competitorUrls: z.array(z.string().url()).min(1).max(8),
  radius: z.number().min(0.05).max(0.95).nullable().optional(),
  k: z.number().int().min(2).max(8).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Проверьте формат ссылок: нужны полные URL вида https://…",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const data = parsed.data;
    if (!data.yourUrl && !(data.yourText && data.yourText.trim().length >= 80)) {
      return NextResponse.json(
        { error: "Укажите свой URL или вставьте черновик (минимум 80 символов)" },
        { status: 400 },
      );
    }

    const result = await analyzeContent({
      query: data.query,
      yourUrl: data.yourUrl || undefined,
      yourText: data.yourText,
      yourLabel: data.yourLabel,
      competitorUrls: data.competitorUrls,
      radius: data.radius ?? null,
      k: data.k,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось выполнить анализ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
