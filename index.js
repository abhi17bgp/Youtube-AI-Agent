require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

/* ===========================
   GEMINI SETUP
=========================== */

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* ===========================
   GLOBAL VARIABLES
=========================== */

let browser = null;
let activePage = null;

/* ===========================
   INIT BROWSER (ONCE)
=========================== */

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    console.log("Browser initialized");
  }
}

/* ===========================
   PLAY YOUTUBE
=========================== */

async function playYouTube(song) {
  await initBrowser();

  const page = await browser.newPage(); // new page each time
  activePage = page;

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36",
  );

  await page.goto(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`,
    { waitUntil: "networkidle2" },
  );

  await page.waitForSelector("a#video-title");

  const videos = await page.$$("a#video-title");
  if (videos.length === 0) {
    throw new Error("No video found");
  }

  await videos[0].click();

  await page.waitForSelector("video");

  await page.evaluate(() => {
    const video = document.querySelector("video");
    if (video) video.play();
  });

  console.log("Video started");
}

/* ===========================
   PAUSE VIDEO
=========================== */

async function pauseVideo() {
  if (!activePage) {
    throw new Error("No active video");
  }

  await activePage.evaluate(() => {
    const video = document.querySelector("video");
    if (video) video.pause();
  });

  console.log("Video paused");
}

/* ===========================
   GEMINI INTENT
=========================== */

async function getAIAction(userInput) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `
You are an AI assistant.

Return ONLY valid JSON.
Do NOT use markdown.
Do NOT use backticks.
Do NOT explain.

Actions:
1. play_youtube
2. pause_video

If play:
{ "action": "play_youtube", "song": "song name" }

If pause:
{ "action": "pause_video" }

Instruction: "${userInput}"
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;

  let text = response.text().trim();

  // Clean markdown if AI adds it
  text = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  console.log("AI RAW:", text);

  return JSON.parse(text);
}

/* ===========================
   ROUTES
=========================== */

app.get("/", (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>Gemini AI YouTube Agent</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>

    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-family: 'Segoe UI', sans-serif;
      }

      body {
        background: linear-gradient(135deg, #141e30, #243b55);
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        color: white;
        transition: 0.3s ease;
      }

      .container {
        width: 450px;
        backdrop-filter: blur(20px);
        background: rgba(255,255,255,0.05);
        border-radius: 20px;
        padding: 25px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      }

      h1 {
        text-align: center;
        margin-bottom: 20px;
        font-size: 22px;
      }

      .chat-box {
        height: 250px;
        overflow-y: auto;
        margin-bottom: 15px;
        padding-right: 5px;
      }

      .message {
        margin: 8px 0;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 14px;
        max-width: 80%;
        word-wrap: break-word;
      }

      .user {
        background: #4facfe;
        align-self: flex-end;
        margin-left: auto;
      }

      .bot {
        background: #43e97b;
        color: black;
      }

      .input-area {
        display: flex;
        gap: 10px;
      }

      input {
        flex: 1;
        padding: 10px;
        border-radius: 10px;
        border: none;
        outline: none;
      }

      button {
        padding: 10px 15px;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        font-weight: bold;
        transition: 0.2s;
      }

      .send-btn {
        background: #4facfe;
        color: white;
      }

      .mic-btn {
        background: #ff416c;
        color: white;
      }

      button:hover {
        transform: scale(1.05);
      }

      .loading {
        display: none;
        text-align: center;
        margin-top: 10px;
      }

      .spinner {
        border: 3px solid rgba(255,255,255,0.3);
        border-top: 3px solid white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        animation: spin 1s linear infinite;
        margin: auto;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .toggle {
        text-align: right;
        margin-bottom: 10px;
        cursor: pointer;
        font-size: 12px;
        opacity: 0.8;
      }

      .light-mode {
        background: linear-gradient(135deg, #f5f7fa, #c3cfe2);
        color: black;
      }

      .light-mode .container {
        background: rgba(255,255,255,0.8);
        color: black;
      }
    </style>
  </head>

  <body>

    <div class="container">
      <div class="toggle" onclick="toggleMode()">🌙 Toggle Mode</div>

      <h1>🎵 Gemini AI YouTube Assistant</h1>

      <div class="chat-box" id="chatBox"></div>

      <div class="input-area">
        <input type="text" id="instruction"
          placeholder="Play Kesariya or Pause song" />
        <button class="send-btn" onclick="sendCommand()">Send</button>
        <button class="mic-btn" onclick="startListening()">🎤</button>
      </div>

      <div class="loading" id="loading">
        <div class="spinner"></div>
      </div>
    </div>

<script>

  const chatBox = document.getElementById("chatBox");

  function addMessage(text, type) {
    const msg = document.createElement("div");
    msg.classList.add("message", type);
    msg.innerText = text;
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function speak(text) {
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    window.speechSynthesis.speak(speech);
  }

  async function sendCommand() {

    const input = document.getElementById("instruction");
    const instruction = input.value.trim();
    if (!instruction) return alert("Enter a command");

    addMessage(instruction, "user");
    input.value = "";

    document.getElementById("loading").style.display = "block";

    const response = await fetch("/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction })
    });

    const data = await response.json();

    document.getElementById("loading").style.display = "none";

    addMessage(data.message, "bot");
    speak(data.message);
  }

  function startListening() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech Recognition not supported.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.start();

    recognition.onresult = function(event) {
      const transcript = event.results[0][0].transcript;
      document.getElementById("instruction").value = transcript;
      sendCommand();
    };
  }

  function toggleMode() {
    document.body.classList.toggle("light-mode");
  }

  document.getElementById("instruction")
    .addEventListener("keydown", function(e) {
      if (e.key === "Enter") sendCommand();
    });

</script>

  </body>
  </html>
  `);
});

/* ===========================
   AGENT ROUTE
=========================== */

app.post("/agent", async (req, res) => {
  try {
    const { instruction } = req.body;

    const aiDecision = await getAIAction(instruction);

    console.log("Parsed AI:", aiDecision);

    const action = aiDecision.action?.trim().toLowerCase();

    if (action === "play_youtube") {
      await playYouTube(aiDecision.song);

      return res.json({
        message: `Playing ${aiDecision.song} on YouTube`,
      });
    }

    if (action === "pause_video") {
      await pauseVideo();

      return res.json({
        message: "Video paused.",
      });
    }

    return res.json({
      message: "Unknown command",
    });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({
      message: "Something went wrong.",
    });
  }
});

/* ===========================
   START SERVER
=========================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
