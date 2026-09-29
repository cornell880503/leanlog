import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div className="num text-7xl font-bold text-brand">404</div>
      <p className="mt-2 text-lg font-semibold">找不到這一頁</p>
      <p className="mt-1 text-sm text-dim">可能是網址打錯，或這筆紀錄已被刪除。</p>
      <Link href="/" className="press mt-6 inline-flex h-12 items-center rounded-xl bg-brand px-6 font-semibold text-brand-ink">
        回到今天
      </Link>
    </div>
  );
}
