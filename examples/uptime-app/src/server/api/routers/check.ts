import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { checks, urls } from "~/server/db/schema";
import { pflow } from "~/server/pflow";

interface UrlCheckResult {
  status_code: number | null;
  response_time_ms: number;
  error: string | null;
}

export const checkRouter = createTRPCRouter({
  listUrls: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.urls.findMany({
      orderBy: [urls.createdAt],
      with: { checks: { limit: 1, orderBy: [desc(checks.checkedAt)] } },
    });
  }),

  addUrl: publicProcedure
    .input(z.object({ url: z.string().url(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [result] = await ctx.db.insert(urls).values(input).returning();
      return result;
    }),

  deleteUrl: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(urls).where(eq(urls.id, input.id));
    }),

  // This triggers the 0pflow url-check workflow
  checkUrl: publicProcedure
    .input(z.object({ urlId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const url = await ctx.db.query.urls.findFirst({
        where: eq(urls.id, input.urlId),
      });
      if (!url) throw new Error("URL not found");

      // Trigger 0pflow workflow instead of inline fetch
      const result = await pflow.triggerWorkflow<UrlCheckResult>("url-check", {
        url: url.url,
      });

      // Save result to database
      const [check] = await ctx.db
        .insert(checks)
        .values({
          urlId: input.urlId,
          statusCode: result.status_code,
          responseTimeMs: result.response_time_ms,
          error: result.error,
        })
        .returning();

      return check;
    }),

  getHistory: publicProcedure
    .input(
      z.object({ urlId: z.string().uuid(), limit: z.number().default(20) }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.checks.findMany({
        where: eq(checks.urlId, input.urlId),
        orderBy: [desc(checks.checkedAt)],
        limit: input.limit,
      });
    }),
});
