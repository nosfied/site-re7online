import "../bootstrap-env.js";
import { getPrisma } from "../db.js";
import { env } from "../config/env.js";

const prisma = getPrisma();

async function main() {
  const clientKey = env.CLIENT_ID ?? "default";
  const client = await prisma.client.upsert({
    where: { clientKey },
    update: {},
    create: { clientKey, name: clientKey },
  });

  if (env.WHATSAPP_PHONE_NUMBER_ID) {
    await prisma.waPhoneNumber.upsert({
      where: { phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID },
      update: { clientId: client.id },
      create: {
        clientId: client.id,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        display: env.WHATSAPP_PHONE_NUMBER_ID,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
