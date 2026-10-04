// Prints a new VAPID key pair for session reminders. See README → Reminders when the app is closed.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
console.log("VAPID_PUBLIC_KEY=" + pub);
console.log("VAPID_PRIVATE_KEY=" + d);
