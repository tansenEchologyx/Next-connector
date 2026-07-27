import { prisma } from "./prisma";

export type WorkerShopSession = {
  shop: string;
  accessToken: string;
};

export async function resolveWorkerShopSession(): Promise<WorkerShopSession> {
  const configuredShop = process.env.WORKER_SHOP?.trim();

  if (configuredShop) {
    const session = await findOfflineSession(configuredShop);
    if (!session) {
      throw new Error(
        `No offline Shopify session found for WORKER_SHOP=${configuredShop}. Open the app in admin to refresh auth.`,
      );
    }
    return session;
  }

  const settings = await prisma.appSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (settings?.shop) {
    const session = await findOfflineSession(settings.shop);
    if (session) return session;
  }

  const session = await prisma.session.findFirst({
    where: { isOnline: false },
    orderBy: { id: "desc" },
  });

  if (!session) {
    throw new Error(
      "No offline Shopify session found. Install/open the app on your dev store first.",
    );
  }

  return { shop: session.shop, accessToken: session.accessToken };
}

async function findOfflineSession(
  shop: string,
): Promise<WorkerShopSession | null> {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { id: "desc" },
  });

  if (!session) return null;
  return { shop: session.shop, accessToken: session.accessToken };
}
