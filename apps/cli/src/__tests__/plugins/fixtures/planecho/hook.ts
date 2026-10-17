export {};
const payload = JSON.parse(await Bun.stdin.text());
console.log(
  JSON.stringify({
    messages: [
      `keys=${payload.tasks.map((t: any) => t.key).join(",")}`,
      `deps=${payload.tasks.map((t: any) => t.dependencies.join("+")).join(",")}`,
    ],
  }),
);
