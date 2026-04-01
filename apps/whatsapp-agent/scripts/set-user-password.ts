#!/usr/bin/env tsx

import { getPrisma } from "../src/db.js";
import { hashPassword } from "../src/auth/clientAuth.js";

type Options = {
  email: string;
  password: string;
};

function parseArgs(argv: string[]): Options {
  let email = "";
  let password = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if ((arg === "--email" || arg === "-e") && argv[index + 1]) {
      email = String(argv[index + 1]).trim().toLowerCase();
      index += 1;
      continue;
    }
    if ((arg === "--password" || arg === "-p") && argv[index + 1]) {
      password = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage(0);
    }
  }

  if (!email || !password) {
    printUsage(1);
  }

  return { email, password };
}

function printUsage(exitCode: number): never {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(
    [
      "Uso:",
      "  tsx scripts/set-user-password.ts --email usuario@cliente.com --password 'senha-forte'",
      "",
      "Opcoes:",
      "  -e, --email       Email do usuario",
      "  -p, --password    Nova senha em texto plano",
      "  -h, --help        Mostrar ajuda",
      "",
    ].join("\n")
  );
  process.exit(exitCode);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = getPrisma();

  const users = await prisma.user.findMany({
    where: { email: options.email },
    take: 2,
    select: {
      id: true,
      clientId: true,
      name: true,
      email: true,
    },
  });

  if (users.length === 0) {
    throw new Error(`user_not_found:${options.email}`);
  }
  if (users.length > 1) {
    throw new Error(`ambiguous_user_email:${options.email}`);
  }

  const user = users[0];
  const passwordHash = hashPassword(options.password);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        user: {
          id: user.id,
          clientId: user.clientId,
          name: user.name,
          email: user.email,
        },
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error((error as Error).message);
  try {
    await getPrisma().$disconnect();
  } catch {
    // ignore disconnect error in CLI path
  }
  process.exit(1);
});
