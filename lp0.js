import {
    loadScript,
    initializeModules,
    initializeLp0,
    handleLp0Subscription,
    publishMessageToLp0,
  } from "./lp0_utils.js";
  
  class LP0WebChat extends HTMLElement {
    constructor() {
      super();
      this.initialized = false;
      console.log("LP0 WebChat: Constructor initialized.");
    }
  
    // Validates required attributes and logs errors if any are missing
    validateAttributes() {
      const requiredAttributes = [
        "bot-id",
        "customer-id",
        "user-message-classes",
        "bot-message-classes",
        "user-align-classes",
        "bot-align-classes",
        "container-classes",
        "input-classes",
        "send-button-classes",
        "input-wrapper-classes",
        "theme-config",
        "placeholder-text", // New attribute for placeholder text
        "show-history",
        "hide-start"
      ];
  
      return requiredAttributes.every(attr => {
        if (!this.hasAttribute(attr)) {
          console.error(`LP0 WebChat: Missing required attribute - ${attr}`);
          return false;
        }
        return true;
      });
    }
  
    async connectedCallback() {
      if (this.initialized) {
        console.log("LP0 WebChat: Already initialized.");
        return;
      }
  
      if (!this.validateAttributes()) {
        console.error("LP0 WebChat: Initialization aborted due to missing attributes.");
        return;
      }
  
      this.initialized = true;
      console.log("LP0 WebChat: ConnectedCallback - Initialization starts.");
  
      this.setupHTMLStructure();
      await this.initializeComponent();
    }
  
    setupHTMLStructure() {
      this.innerHTML = `
        <div id="chat-container" class="${this.getAttribute("container-classes")}">
          <div id="chat" class="chat-container">
            <div id="loading" class="text-center" style="display: none;">Loading...</div>
            <div id="error" class="text-center mb-2" style="display: none;">An error occurred. Please try again later.</div>
            <div hx-lp0-subscribe class="chat-messages" aria-live="polite"></div>
          </div>
          <div class="${this.getAttribute("input-wrapper-classes")}">
            <input type="text" id="userInput" placeholder="${this.getAttribute("placeholder-text")}" class="${this.getAttribute("input-classes")} border-none rounded-none focus:outline-none focus:ring-0" />
            <button class="${this.getAttribute("send-button-classes")} border-none rounded-none" id="sendMessageButton">Send</button>
          </div>
        </div>
      `;
    }
  
    async initializeComponent() {
      try {
        await loadScript("https://cdn.twind.style", document.head);
        console.log("All scripts loaded successfully.");
  
        const themeConfig = JSON.parse(this.getAttribute("theme-config"));
        window.twind.install({
          theme: {
            extend: {
              colors: themeConfig.colors,
            },
          },
        });
        console.log("Twind installed with user theme config.");
  
        await initializeModules();
        await initializeLp0();
  
        const chatElement = this.querySelector("[hx-lp0-subscribe]");
        const showHistory = this.getAttribute('show-history') === 'true';
        const hideStart = this.getAttribute('hide-start') === 'true';
  
        if (chatElement) {
          handleLp0Subscription(
            this.getAttribute("bot-id"),
            this.getAttribute("customer-id"),
            chatElement,
            this.getAttribute("user-align-classes"),
            this.getAttribute("user-message-classes"),
            this.getAttribute("bot-align-classes"),
            this.getAttribute("bot-message-classes"),
            hideStart,
            showHistory
          );
        }
  
        const sendMessageButton = this.querySelector("#sendMessageButton");
        const userInput = this.querySelector("#userInput");
  
        // Trigger send message on Enter key press
        userInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            sendMessageButton.click();
          }
        });
  
        sendMessageButton.addEventListener(
          "click",
          async () => {
            const userInputValue = userInput.value;
            await publishMessageToLp0(
              this.getAttribute("bot-id"),
              this.getAttribute("customer-id"),
              userInputValue,
            );
            userInput.value = ""; // Clear the input field after sending the message
          },
        );
      } catch (error) {
        console.error("Error during LP0 WebChat initialization:", error);
      }
    }
  }
  
  customElements.define("lp0-webchat", LP0WebChat);
  