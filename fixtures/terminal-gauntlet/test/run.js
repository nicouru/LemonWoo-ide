const forbidden = [
  "DEEPSEEK_API_KEY",
  "GITHUB_TOKEN",
  "MY_SECRET",
  "PASSWORD",
  "CUSTOM_KEY"
].filter((key) => process.env[key]);

if (forbidden.length) {
  console.error(`forbidden-env:${forbidden.join(",")}`);
  process.exit(1);
}

console.log("gauntlet-ok");
