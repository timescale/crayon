export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getCrayon } = await import("~/lib/crayon");
    await getCrayon();
  }
}
