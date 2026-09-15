import { AnalyzerApp } from "@/components/AnalyzerApp";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div>
          <p className="eyebrow">Проверка статьи</p>
          <h1 className="brand">
            GIST<span> Map</span>
          </h1>
        </div>
        <p className="brand-sub">
          Простыми словами: сравните свою статью с конкурентами и узнайте, не выглядит ли она как
          копия — и что добавить, чтобы отличаться.
        </p>
      </header>

      <main className="flex-1">
        <AnalyzerApp />
      </main>

      <footer className="site-footer">
        Инструмент для авторов и SEO: помогает увидеть пересечения с чужими текстами. Это не
        «официальный Google», а понятная проверка своими силами.
      </footer>
    </>
  );
}
