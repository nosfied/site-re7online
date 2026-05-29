const APP_FOREGROUND_TTL_MS = 15_000;
let lastAppForegroundAt = 0;
let notificationTagFlip = 0;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const baseTag = typeof data.tag === "string" ? data.tag : "converta-inbox-notifications";
  const increment = Number.isFinite(Number(data.unreadIncrement)) ? Math.max(1, Number(data.unreadIncrement)) : 1;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (Date.now() - lastAppForegroundAt <= APP_FOREGROUND_TTL_MS) return undefined;
      return self.registration.getNotifications();
    }).then((notifications) => {
      if (!notifications) return undefined;
      const previousNotifications = notifications.filter((notification) =>
        String(notification.tag || "").startsWith(baseTag)
      );
      const previousTotal = previousNotifications.reduce((highest, notification) => {
        const total = Number(notification.data?.unreadTotal ?? 0);
        return Number.isFinite(total) && total > highest ? total : highest;
      }, 0);
      const unreadTotal = previousTotal + increment;
      notificationTagFlip = (notificationTagFlip + 1) % 2;
      const tag = `${baseTag}-${notificationTagFlip}`;
      const title = typeof data.title === "string" ? data.title : "Converta";
      const previewBody = typeof data.body === "string" ? data.body.trim() : "";
      const body =
        unreadTotal === 1 && previewBody
          ? previewBody
          : unreadTotal === 1
            ? "1 nova mensagem aguardando atendimento."
          : `${unreadTotal} novas mensagens aguardando atendimento.`;
      const options = {
        body,
        tag,
        data: {
          url: typeof data.url === "string" ? data.url : "/app/inbox",
          unreadTotal,
        },
        icon: "/converta-favicon.png?v=converta-dark",
        badge: "/converta-favicon.png?v=converta-dark",
        renotify: true,
        silent: false,
        vibrate: [180, 80, 180],
        timestamp: Date.now(),
      };

      for (const notification of previousNotifications) {
        notification.close();
      }
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "converta.app_foreground") {
    lastAppForegroundAt = Date.now();
    return;
  }
  if (event.data?.type === "converta.app_background") {
    lastAppForegroundAt = 0;
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/app/inbox", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("navigate" in client && "focus" in client) {
          const navigatedClient = await client.navigate(url).catch(() => null);
          return (navigatedClient || client).focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
