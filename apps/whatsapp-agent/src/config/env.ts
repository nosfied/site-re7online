type Env = {
  PORT: number;
  ENV: string;
};

function toNumber(value: string | undefined, fallback: number) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

export const env: Env = {
  PORT: toNumber(process.env.PORT, 4000),
  ENV: process.env.ENV ?? "dev",
};
