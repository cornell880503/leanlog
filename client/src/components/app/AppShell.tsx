import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { LOGO_URL } from "@/lib/theme";
import { BookOpen, ChevronLeft, History, Home, LineChart, Scale, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

const TABS = [
  { href: "/", label: "今天", icon: Home },
  { href: "/body", label: "身體", icon: Scale },
  { href: "/progress", label: "進度", icon: LineChart },
  { href: "/history", label: "歷史", icon: History },
  { href: "/guide", label: "手冊", icon: BookOpen },
];

export function AppShell({
  title,
  children,
  back,
  hideNav,
  right,
  bottom,
}: {
  title: string;
  children: ReactNode;
  back?: string;
  hideNav?: boolean;
  right?: ReactNode;
  /** Sticky bottom action area (replaces the tab bar). */
  bottom?: ReactNode;
}) {
  const [location, navigate] = useLocation();
  return (
    <div className="min-h-dvh bg-background">
      <header
        className="sticky top-0 z-30 border-b border-line bg-background/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-[480px] items-center gap-2 px-4">
          {back ? (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? window.history.back() : navigate(back))}
              className="press -ml-2 flex size-11 items-center justify-center rounded-lg text-chalk"
              aria-label="返回"
            >
              <ChevronLeft className="size-6" />
            </button>
          ) : (
            <img src={LOGO_URL} alt="" className="size-8 rounded-md" />
          )}
          <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
          {right ??
            (location !== "/settings" && (
              <Link
                href="/settings"
                className="press -mr-2 flex size-11 items-center justify-center rounded-lg text-dim hover:text-chalk"
                aria-label="設定"
              >
                <Settings className="size-5" />
              </Link>
            ))}
        </div>
      </header>
      <main className={cn("mx-auto max-w-[480px] px-4 pt-4", bottom ? "pb-40" : hideNav ? "pb-10" : "pb-28")}>
        {children}
      </main>
      {bottom ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 backdrop-blur safe-bottom">
          <div className="mx-auto max-w-[480px] px-4 py-3">{bottom}</div>
        </div>
      ) : (
        !hideNav && <TabBar location={location} />
      )}
    </div>
  );
}

function TabBar({ location }: { location: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 backdrop-blur safe-bottom">
      <div className="mx-auto grid max-w-[480px] grid-cols-5">
        {TABS.map(t => {
          const active = t.href === "/" ? location === "/" : location.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "press flex h-16 flex-col items-center justify-center gap-1 text-xs",
                active ? "text-brand" : "text-dim"
              )}
            >
              <Icon className="size-5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <img src={LOGO_URL} alt="" className="size-16 animate-pulse rounded-xl" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-between px-6 py-12">
        <div className="pt-10">
          <img src={LOGO_URL} alt="薄肌記錄" className="size-20 rounded-2xl" />
          <h1 className="mt-6 text-3xl font-bold">薄肌記錄</h1>
          <p className="mt-3 text-dim leading-relaxed">
            少打字、多練、看得到進度。
            <br />
            重訓用點的記，排球、體重、摸高一起追蹤。
          </p>
        </div>
        <button
          type="button"
          onClick={() => startLogin()}
          className="press h-14 w-full rounded-xl bg-brand text-lg font-semibold text-brand-ink"
        >
          登入開始記錄
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
