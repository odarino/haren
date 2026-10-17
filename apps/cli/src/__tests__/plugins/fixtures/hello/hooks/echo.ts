export {};

const input = await Bun.stdin.text();
console.log(JSON.stringify({ messages: [`hello ${input || "{}"}`] }));
