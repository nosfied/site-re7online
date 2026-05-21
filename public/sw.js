self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = typeof data.title === "string" ? data.title : "Nova mensagem no Converta";
  const options = {
    body: typeof data.body === "string" ? data.body : "Você recebeu uma nova mensagem.",
    tag: typeof data.tag === "string" ? data.tag : "converta-message",
    data: {
      url: typeof data.url === "string" ? data.url : "/app/inbox",
    },
    icon: "/converta-favicon.png?v=converta-dark",
    badge: "/converta-favicon.png?v=converta-dark",
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
