import webPush from "web-push";

const keys = webPush.generateVAPIDKeys();

console.log(JSON.stringify({
  WEB_PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
  WEB_PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
  WEB_PUSH_SUBJECT: "mailto:suporte@re7online.com",
}, null, 2));
