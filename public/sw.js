self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const tag = typeof data.tag === "string" ? data.tag : "converta-inbox-notifications";
  const increment = Number.isFinite(Number(data.unreadIncrement)) ? Math.max(1, Number(data.unreadIncrement)) : 1;

  event.waitUntil(
    self.registration.getNotifications({ tag }).then((notifications) => {
      const previousTotal = notifications.reduce((highest, notification) => {
        const total = Number(notification.data?.unreadTotal ?? 0);
        return Number.isFinite(total) && total > highest ? total : highest;
      }, 0);
      const unreadTotal = previousTotal + increment;
      const title = typeof data.title === "string" ? data.title : "Converta";
      const body =
        unreadTotal === 1
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
        renotify: false,
      };

      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app/inbox";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
