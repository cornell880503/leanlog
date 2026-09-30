import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  bodyRouter,
  calendarRouter,
  trendsRouter,
  dashboardRouter,
  exercisesRouter,
  exportRouter,
  settingsRouter,
  trainingRouter,
} from "./routers/features";

export const appRouter = router({
  // All APIs live under /api/ so the gateway routes them to the server.
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  training: trainingRouter,
  exercises: exercisesRouter,
  body: bodyRouter,
  settings: settingsRouter,
  dashboard: dashboardRouter,
  calendar: calendarRouter,
  trends: trendsRouter,
  export: exportRouter,
});

export type AppRouter = typeof appRouter;
