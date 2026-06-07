export const healthRoutes = {
  "/api/health": {
    GET: () =>
      Response.json({
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
  },
};
