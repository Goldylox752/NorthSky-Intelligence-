<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NorthSky Intelligence</title>

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">

<style>
body {
  margin: 0;
  font-family: 'Inter', sans-serif;
  background: radial-gradient(circle at top, #0f172a, #020617);
  color: #e2e8f0;
}

.container {
  max-width: 1000px;
  margin: auto;
  padding: 30px;
}

.hero {
  text-align: center;
  padding: 60px 20px 30px;
}

.hero h1 {
  font-size: 40px;
}

.hero p {
  opacity: 0.7;
}

.input-box {
  display: flex;
  gap: 10px;
  background: rgba(30,41,59,0.5);
  padding: 10px;
  border-radius: 14px;
}

input {
  flex: 1;
  padding: 14px;
  border-radius: 10px;
  border: none;
  background: #020617;
  color: white;
}

button {
  padding: 14px 20px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg,#3b82f6,#6366f1);
  color: white;
  cursor: pointer;
  font-weight: 600;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.secondary {
  background: rgba(255,255,255,0.08);
}

.card {
  background: rgba(30,41,59,0.6);
  border-radius: 16px;
  padding: 20px;
  margin-top: 25px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

img {
  width: 100%;
  border-radius: 10px;
  margin-top: 10px;
}

.loader {
  margin-top: 20px;
  opacity: 0.6;
}

.history div {
  cursor: pointer;
  padding: 6px;
}
</style>
</head>

<body>

<div class="container">

  <div class="hero">
    <h1>🚀 NorthSky Intelligence</h1>
    <p>Turn any URL into AI-powered insights</p>
  </div>

  <div class="input-box">
    <input id="urlInput" placeholder="Paste URL..." />
    <button onclick="runAI()">Analyze</button>
  </div>

  <div class="actions">
    <button class="secondary" onclick="getTrending()">🔥 Trending</button>
  </div>

  <div class="loader" id="loader"></div>
  <div id="output"></div>
  <div class="history" id="history"></div>

</div>

<script>
const API_URL = "https://northsky-ai.onrender.com";

/* ================= INIT ================= */
if (!localStorage.getItem("history")) {
  localStorage.setItem("history", JSON.stringify([]));
}
renderHistory();

/* ================= ANALYZE ================= */
async function runAI() {
  const url = document.getElementById("urlInput").value;
  const output = document.getElementById("output");
  const loader = document.getElementById("loader");

  if (!url.trim()) {
    output.innerHTML = "<div class='card'>Enter a URL</div>";
    return;
  }

  loader.innerText = "⚡ Analyzing...";
  output.innerHTML = "";

  try {
    const res = await fetch(`${API_URL}/rip?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    loader.innerText = "";

    if (!data.success) {
      output.innerHTML = `<div class='card'>Error</div>`;
      return;
    }

    render(data);
    saveHistory(url);

  } catch {
    loader.innerText = "";
    output.innerHTML = "<div class='card'>Connection failed</div>";
  }
}

/* ================= TRENDING ================= */
async function getTrending() {
  const output = document.getElementById("output");

  output.innerHTML = "<div class='card'>🔥 Loading trends...</div>";

  try {
    const res = await fetch(`${API_URL}/trending`);
    const data = await res.json();

    let html = "<div class='card'><h2>🔥 Trending</h2>";

    data.results.forEach(item => {
      html += `
        <div style="margin-top:10px;">
          <b>${item.title}</b><br>
          <button onclick="analyzeTrending('${item.url}')">Analyze</button>
        </div>
      `;
    });

    html += "</div>";
    output.innerHTML = html;

  } catch {
    output.innerHTML = "<div class='card'>Failed to load</div>";
  }
}

function analyzeTrending(url) {
  document.getElementById("urlInput").value = url;
  runAI();
}

/* ================= RENDER ================= */
function render(data) {
  const output = document.getElementById("output");
  const meta = data.metadata || {};
  const ai = data.analysis;

  output.innerHTML = `
    <div class="card">
      <h2>${meta.title || "Untitled"}</h2>
      <p>${meta.description || ""}</p>
      ${meta.image ? `<img src="${meta.image}">` : ""}
    </div>

    ${ai ? `
      <div class="card">
        <h3>🧠 AI Intelligence</h3>
        <div class="grid">
          <div><b>Summary</b><p>${ai.summary}</p></div>
          <div><b>Hook</b><p>${ai.hook}</p></div>
          <div><b>Audience</b><p>${ai.target_audience}</p></div>
          <div><b>Money</b><p>${ai.monetization_angle}</p></div>
        </div>
        <p><b>🔥 Viral Score:</b> ${ai.viral_score}/10</p>
      </div>
    ` : ""}
  `;
}

/* ================= HISTORY ================= */
function saveHistory(url) {
  let history = JSON.parse(localStorage.getItem("history"));
  history.unshift(url);
  history = history.slice(0,5);
  localStorage.setItem("history", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("history"));
  const el = document.getElementById("history");

  el.innerHTML = "<h4>Recent</h4>" +
    history.map(h => `<div onclick="reuse('${h}')">${h}</div>`).join("");
}

function reuse(url) {
  document.getElementById("urlInput").value = url;
}
</script>

</body>
</html>