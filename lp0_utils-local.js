export async function loadScript(src, shadowRoot) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    shadowRoot.appendChild(script);
  });
}

export async function initializeModules() {
  try {
    console.log("Loading external modules...");

    const bufferModule = await import(
      "https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm"
    );
    window.Buffer = bufferModule.Buffer;
    if (!window.Buffer) throw new Error("Buffer module failed to load.");
    console.log("Buffer module loaded.");

    window.nats = await import(
      "https://cdn.jsdelivr.net/npm/nats.ws@1.29.2/+esm"
    );
    if (!window.nats) throw new Error("NATS module failed to load.");
    console.log("NATS module loaded.");

    window.nkeys = (
      await import("https://cdn.jsdelivr.net/npm/ts-nkeys@1.0.16/+esm")
    ).default;
    if (!window.nkeys) throw new Error("nkeys module failed to load.");
    console.log("nkeys module loaded.");

    const uuidModule = await import(
      "https://cdn.jsdelivr.net/npm/uuid@10.0.0/+esm"
    );
    window.uuidv4 = uuidModule.v4;
    if (!window.uuidv4) throw new Error("UUID module failed to load.");
    console.log("UUID module loaded.");

    window.sc = window.nats.StringCodec();
    if (!window.sc) throw new Error("StringCodec failed to initialize.");
    console.log("StringCodec initialized.");
  } catch (error) {
    console.error("Error initializing modules:", error);
    throw error;
  }
}

export async function getJwt(publicKey) {
  try {
    console.log("Fetching JWT for public key:", publicKey);
    const response = await fetch(
      `http://localhost:4322/jwt/user?public_key=${encodeURIComponent(publicKey)}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to get JWT: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.jwt) throw new Error("JWT token is missing in the response.");
    console.log("JWT fetched successfully.");
    return data.jwt;
  } catch (error) {
    console.error("Error fetching JWT:", error);
    throw error;
  }
}

export async function initializeLp0() {
  try {
    console.log("Initializing LP0...");

    window.lp0_session_id = window.uuidv4();
    if (!window.lp0_session_id)
      throw new Error("Failed to generate session ID.");
    console.log("Session ID generated:", window.lp0_session_id);

    const seed =
      localStorage.getItem("custSeed") ||
      window.nkeys.createUser().getSeed().toString();
    localStorage.setItem("custSeed", seed);

    const keypair = window.nkeys.fromSeed(Buffer.from(seed));
    window.publicKey = keypair.getPublicKey().toString();
    if (!window.publicKey) throw new Error("Failed to generate public key.");
    console.log("Public key generated:", window.publicKey);

    const fetchedJwt = await getJwt(window.publicKey);
    if (!fetchedJwt) throw new Error("Failed to fetch JWT.");

    const options = {
      servers: "ws://localhost:5222",
      authenticator: window.nats.jwtAuthenticator(
        fetchedJwt,
        new Uint8Array(keypair.getSeed()),
      ),
      inboxPrefix: `_INBOX.${keypair.getPublicKey().toString()}`,
      timeout: 60000,
    };

    const nc = await window.nats.connect(options);
    const js = nc.jetstream();

    window.nc = nc;
    window.js = js;
    if (!window.nc || !window.js)
      throw new Error("Failed to establish NATS connection.");
    console.log("NATS connection established.");
  } catch (error) {
    console.error("Error initializing LP0:", error);
    throw error;
  }
}

export async function handleLp0Subscription(
  botId,
  customerId,
  chatElement,
  userAlignClasses,
  userMessageClasses,
  botAlignClasses,
  botMessageClasses,
  hideStart, // existing parameter
  showHistory, // new parameter
  handleBotResponse // callback function
) {
  try {
    console.log("Handling LP0 subscription for botId:", botId, "customerId:", customerId);

    if (!window.nc || !window.js) {
      throw new Error("NATS connection (nc or js) is not established.");
    }

    const sessionId = window.lp0_session_id;
    const userPublicKey = window.publicKey;

    const userSub = window.nc.subscribe(`user.${userPublicKey}.${sessionId}.user`);
    (async () => {
      for await (const m of userSub) {
        const message = window.sc.decode(m.data);
        if (!message) throw new Error("Failed to decode user message.");
        console.log("Received user message:", message);
        if (message === "/start" && hideStart) {
          continue;
        }
        // Only display user messages if showHistory is true
        if (showHistory) {
          chatElement.innerHTML += `<div class="${userAlignClasses}"><div class="${userMessageClasses}">${message}</div></div>`;
        }
      }
    })().catch(console.error);

    const botSub = window.nc.subscribe(`user.${userPublicKey}.${sessionId}.bot.${botId}`);
    (async () => {
      for await (const m of botSub) {
        const message = window.sc.decode(m.data);
        if (!message) throw new Error("Failed to decode bot message.");
        console.log("Received bot message:", message);

        if (!showHistory) {
          // Clear existing messages and only show the latest bot message if showHistory is false
          chatElement.innerHTML = `<div class="${botAlignClasses}"><div class="${botMessageClasses}">${message}</div></div>`;
        } else {
          // Add new bot message to the chat
          chatElement.innerHTML += `<div class="${botAlignClasses}"><div class="${botMessageClasses}">${message}</div></div>`;
        }

        handleBotResponse(); // Stop "Thinking" animation and reset input
      }
    })().catch(console.error);

    await publishMessageToLp0(botId, customerId, "/start");
    console.log('"/start" message sent.');
  } catch (error) {
    console.error("Error handling LP0 subscription:", error);
    throw error;
  }
}


export async function publishMessageToLp0(botId, customerId, message) {
  try {
    if (!botId || !customerId || !message)
      throw new Error("Bot ID, Customer ID, and message are required.");
    const sessionId = window.lp0_session_id;
    const subject = `service.chat.${window.publicKey}.${sessionId}.${botId}.${customerId}`;
    console.log(`Publishing message to subject: ${subject}`);
    await window.nc.publish(subject, window.sc.encode(message));
    console.log("Message published successfully.");
  } catch (error) {
    console.error("Error publishing LP0 message:", error);
    throw error;
  }
}
