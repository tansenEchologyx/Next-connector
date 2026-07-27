import prisma from "../db.server";

export async function resolveDefaultShop(): Promise<string> {
  const configuredShop = process.env.WORKER_SHOP?.trim();
  if (configuredShop) return configuredShop;

  const settings = await prisma.appSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (settings?.shop) return settings.shop;

  const session = await prisma.session.findFirst({
    where: { isOnline: false },
    orderBy: { id: "desc" },
  });

  if (!session) {
    throw new Error(
      "No shop configured. Set WORKER_SHOP or open the app in Shopify admin.",
    );
  }

  return session.shop;
}
