import { CronExpressionParser } from "cron-parser";

/**
 * Compute the next run time for a cron expression.
 */
export function computeNextRun(
  cronExpression: string,
  timezone: string,
  after?: Date,
): Date {
  const expr = CronExpressionParser.parse(cronExpression, {
    currentDate: after ?? new Date(),
    tz: timezone,
  });
  return expr.next().toDate();
}

/**
 * Validate a 5-field cron expression.
 */
export function validateCronExpression(expression: string): boolean {
  if (!expression || !expression.trim()) return false;
  try {
    CronExpressionParser.parse(expression);
    return true;
  } catch {
    return false;
  }
}
