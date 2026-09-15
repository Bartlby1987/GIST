import * as cheerio from "cheerio";

const BLOCKED_TAGS = "script, style, noscript, svg, iframe, canvas, form, nav, footer, header, aside, button";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function absoluteUrl(base: string, href: string | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export async function fetchPageText(url: string): Promise<{
  title: string;
  text: string;
  headings: string[];
  finalUrl: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Некорректный URL: ${url}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Поддерживаются только ссылки http(s)");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const res = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GISTMapBot/1.0; +https://gist-map.vercel.app) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
        "Cache-Control": "no-cache",
      },
    });

    if (!res.ok) {
      throw new Error(`Сайт ответил ошибкой HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("xml")) {
      throw new Error(`Неподдерживаемый тип ответа: ${contentType || "неизвестно"}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    $(BLOCKED_TAGS).remove();
    $("[aria-hidden='true']").remove();
    $(".cookie, .cookies, .newsletter, .advert, .ads, .share, .social").remove();

    const title =
      normalizeWhitespace($("title").first().text()) ||
      normalizeWhitespace($("h1").first().text()) ||
      parsed.hostname;

    const headings = $("h1, h2, h3")
      .map((_, el) => normalizeWhitespace($(el).text()))
      .get()
      .filter((h) => h.length > 2 && h.length < 160)
      .slice(0, 40);

    const main =
      $("article").first().text() ||
      $("main").first().text() ||
      $("[role='main']").first().text() ||
      $(".post-content, .entry-content, .article-body, .content").first().text() ||
      $("body").text();

    const text = normalizeWhitespace(main).slice(0, 24000);
    if (text.length < 80) {
      throw new Error("Слишком мало текста — сайт, возможно, закрыл страницу от ботов");
    }

    return {
      title,
      text,
      headings,
      finalUrl: absoluteUrl(parsed.toString(), res.url) ?? parsed.toString(),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Превышено время ожидания загрузки страницы");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
