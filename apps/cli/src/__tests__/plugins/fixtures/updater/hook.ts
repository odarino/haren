export {};
const payload = JSON.parse(await Bun.stdin.text());
console.log(
  JSON.stringify({
    messages: [
      `config=${process.env.HAREN_PLUGIN_CONFIG}`,
      `hook=${payload.hook}`,
      `data=${process.env.HAREN_PLUGIN_DATA}`,
    ],
    updates: [{ module: "checkout", feature: "task-1-add-cart-api", status: "in-progress" }],
  }),
);
