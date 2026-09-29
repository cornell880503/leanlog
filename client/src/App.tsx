import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import { AuthGate } from "./components/app/AppShell";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Today from "./pages/Today";

const Workout = lazy(() => import("./pages/Workout"));
const Volleyball = lazy(() => import("./pages/Volleyball"));
const Body = lazy(() => import("./pages/Body"));
const Progress = lazy(() => import("./pages/Progress"));
const History = lazy(() => import("./pages/History"));
const HistoryDetail = lazy(() => import("./pages/HistoryDetail"));
const Settings = lazy(() => import("./pages/Settings"));

function PageFallback() {
  return (
    <div className="mx-auto max-w-[480px] space-y-3 px-4 pt-20">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-32 animate-pulse rounded-xl bg-surface" />
      ))}
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/" component={Today} />
        <Route path="/workout/:type">{params => <Workout params={params} />}</Route>
        <Route path="/volleyball" component={Volleyball} />
        <Route path="/body" component={Body} />
        <Route path="/progress" component={Progress} />
        <Route path="/history" component={History} />
        <Route path="/history/:id">{params => <HistoryDetail params={params} />}</Route>
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster position="top-center" theme="dark" />
          <AuthGate>
            <Router />
          </AuthGate>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
