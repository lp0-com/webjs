const JWT_URL = "http://localhost:4322/jwt/user";
const NATS_URL = "ws://localhost:5222";
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
      `${JWT_URL}?public_key=${encodeURIComponent(publicKey)}`,
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

    window.lp0_session_id = Math.floor(Date.now() / 1000) + "_" + window.uuidv4();
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
      servers: NATS_URL,
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
  hangupUrl,
  hangupWait,
  hideStart, 
  showHistory, 
  handleBotResponse,
  userEmail,
  firstName,
  lastName

) {
  try {
    console.log("Handling LP0 subscription for botId:", botId, "customerId:", customerId);

    if (!window.nc || !window.js) {
      throw new Error("NATS connection (nc or js) is not established.");
    }

    const sessionId = window.lp0_session_id;
    const userPublicKey = window.publicKey;

    const formatMessage = (message) => {
      return message.replace(/\\\\n/g,'\n').split('\n').join('<br />');
    };

    const userSub = window.nc.subscribe(`user.${userPublicKey}.${sessionId}.user`);
    (async () => {
      for await (const m of userSub) {
        const message = window.sc.decode(m.data);
        if (!message) throw new Error("Failed to decode user message.");
        console.log("Received user message:", message);
        if (message.startsWith("/start") && hideStart) {
          continue;
        }
        // Only display user messages if showHistory is true
        if (showHistory) {
          chatElement.innerHTML += `<div class="${userAlignClasses}"><div class="${userMessageClasses}">${formatMessage(message)}</div></div>`;
        }
      }
    })().catch(console.error);

    const botSub = window.nc.subscribe(`user.${userPublicKey}.${sessionId}.bot.${botId}`);
    (async () => {
      for await (const m of botSub) {
        let message = window.sc.decode(m.data);
        if (!message) throw new Error("Failed to decode bot message.");
        console.log("Received bot message:", message);
        if (message.endsWith("[HANGUP]")) {
          // Remove the [HANGUP] tag
          message = message.replace("[HANGUP]", "").trim();
          console.log("gona disable input");
          if (chatElement.closest("lp0-webchat")) {
            console.log("Found lp0-webchat element, disabling input");
            chatElement.closest("lp0-webchat").disableInput();
          } else {
            console.log("lp0-webchat element not found");
            throw new Error("lp0-webchat element not found");
          }
          

          console.log("Hangup URL:", hangupUrl, "Hangup Wait:", hangupWait);
          if (hangupUrl && hangupWait) {
            setTimeout(() => {
              window.location.href = hangupUrl;
            }, parseInt(hangupWait, 10));
          }
        }

        const formattedMessage = formatMessage(message);

        if (!showHistory) {
          // Clear existing messages and only show the latest bot message if showHistory is false
          chatElement.innerHTML = `<div class="${botAlignClasses}"><div class="${botMessageClasses}">${formattedMessage}</div></div>`;
        } else {
          // Add new bot message to the chat
          chatElement.innerHTML += `<div class="${botAlignClasses}"><div class="${botMessageClasses}">${formattedMessage}</div></div>`;
        }

        handleBotResponse(); // Stop "Thinking" animation and reset input
      }
    })().catch(console.error);

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let msgObj = {
      USER_TIMEZONE: userTimezone
    };
    if (userEmail) {
      msgObj.USER_EMAIL = userEmail;
    }
    if (firstName) {
      msgObj.USER_FIRST_NAME = firstName;
    }
    if (lastName) {
      msgObj.USER_LAST_NAME = lastName;
    }
    await publishMessageToLp0(botId, customerId, "/start " + JSON.stringify(msgObj));
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
