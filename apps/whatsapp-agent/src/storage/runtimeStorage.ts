import { createStorage } from "./storageFactory.js";

// Central runtime storage instance used by webhook, admin routes, and outbound services.
export const runtimeStorage = createStorage();
