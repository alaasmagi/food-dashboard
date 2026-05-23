const statusEl = document.querySelector("#status");
const selectedEnvironmentEl = document.querySelector("#selectedEnvironment");
const environmentPicker = document.querySelector("#environmentPicker");
const canvas = document.querySelector("#wheel");
const spinButton = document.querySelector("#spin");
const winnerEl = document.querySelector("#winner .winner-name");
const wheelTitle = document.querySelector("#wheelTitle");
const ctx = canvas.getContext("2d");

const COLORS = [
  "#35e6b5",
  "#ffd166",
  "#7aa7ff",
  "#ff7aa2",
  "#b58cff",
  "#8ee36f",
  "#ff9f5a",
  "#63d7ff"
];

let environments = [];
let selectedEnvironment = null;
let rotation = 0;
let spinning = false;

loadEnvironments();
window.addEventListener("resize", () => drawWheel());
spinButton.addEventListener("click", spinWheel);

async function loadEnvironments() {
  try {
    const response = await fetch("/api/restaurants", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`API vastas staatusega ${response.status}`);
    }

    const data = await response.json();
    environments = (data.environments || []).map((environment) => ({
      ...environment,
      restaurants: (environment.restaurants || []).filter((restaurant) => restaurant.showOnWheel === true)
    }));
    renderEnvironmentPicker();
    statusEl.textContent = "Valmis";
  } catch (error) {
    statusEl.textContent = "Viga";
    environmentPicker.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderEnvironmentPicker() {
  environmentPicker.innerHTML = environments.map((environment) => `
    <button class="environment-choice" type="button" data-id="${escapeAttribute(environment.id)}">
      <span>${escapeHtml(environment.name)}</span>
      <em>${environment.restaurants.length}</em>
    </button>
  `).join("");

  environmentPicker.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectEnvironment(button.dataset.id));
  });

  if (environments[0]) {
    selectEnvironment(environments[0].id);
  }
}

function selectEnvironment(id) {
  selectedEnvironment = environments.find((environment) => environment.id === id);
  if (!selectedEnvironment) return;

  rotation = 0;
  spinning = false;
  winnerEl.textContent = "-";
  spinButton.disabled = selectedEnvironment.restaurants.length === 0;
  wheelTitle.textContent = selectedEnvironment.name;
  selectedEnvironmentEl.textContent = `${selectedEnvironment.name} · ${selectedEnvironment.restaurants.length}`;

  environmentPicker.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.id === id);
  });

  drawWheel();
}

function spinWheel() {
  if (!selectedEnvironment || spinning || !selectedEnvironment.restaurants.length) return;

  const restaurants = selectedEnvironment.restaurants;
  const selectedIndex = Math.floor(Math.random() * restaurants.length);
  const slice = (Math.PI * 2) / restaurants.length;
  const targetAngle = -(selectedIndex * slice + slice / 2);
  const fullTurns = 6 + Math.floor(Math.random() * 3);
  const startRotation = rotation;
  const targetRotation = normalizeRotation(targetAngle) + Math.PI * 2 * fullTurns;
  const delta = targetRotation - normalizeRotation(startRotation);
  const duration = 4300;
  const startedAt = performance.now();

  spinning = true;
  spinButton.disabled = true;
  winnerEl.textContent = "-";

  requestAnimationFrame(function animate(now) {
    const elapsed = now - startedAt;
    const progress = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(progress);

    rotation = startRotation + delta * eased;
    drawWheel();

    if (progress < 1) {
      requestAnimationFrame(animate);
      return;
    }

    rotation = startRotation + delta;
    drawWheel();
    spinning = false;
    spinButton.disabled = false;
    winnerEl.textContent = restaurants[getWinnerIndexFromRotation()].name;
  });
}

function getWinnerIndexFromRotation() {
  const restaurants = selectedEnvironment?.restaurants || [];
  if (!restaurants.length) return 0;

  const slice = (Math.PI * 2) / restaurants.length;
  return Math.floor(normalizeRotation(-rotation) / slice) % restaurants.length;
}

function drawWheel() {
  const restaurants = selectedEnvironment?.restaurants || [];
  const rect = canvas.getBoundingClientRect();
  const size = Math.max(280, Math.floor(rect.width || 720));
  const ratio = window.devicePixelRatio || 1;

  canvas.width = size * ratio;
  canvas.height = size * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const center = size / 2;
  const radius = center - 12;

  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(rotation);

  if (!restaurants.length) {
    drawEmptyWheel(radius);
    ctx.restore();
    return;
  }

  const slice = (Math.PI * 2) / restaurants.length;

  restaurants.forEach((restaurant, index) => {
    const start = index * slice - Math.PI / 2;
    const end = start + slice;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = COLORS[index % COLORS.length];
    ctx.fill();

    ctx.strokeStyle = "rgba(7, 9, 12, 0.58)";
    ctx.lineWidth = 2;
    ctx.stroke();

    drawLabel(restaurant.name, start + slice / 2, radius, slice);
  });

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = "#07090c";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawEmptyWheel(radius) {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#151d24";
  ctx.fill();
  ctx.strokeStyle = "#25313a";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawLabel(name, angle, radius, slice) {
  const maxWidth = Math.max(64, radius * 0.55);
  const text = truncateText(name, maxWidth, slice);

  ctx.save();
  ctx.rotate(angle);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#06100d";
  ctx.font = `700 ${Math.max(10, Math.min(14, radius / 24))}px Inter, sans-serif`;
  ctx.translate(radius - 18, 0);
  ctx.fillText(text, 0, 0, maxWidth);
  ctx.restore();
}

function truncateText(value, maxWidth, slice) {
  const limit = slice < 0.32 ? 12 : slice < 0.48 ? 18 : 26;
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(4, limit - 1))}…`;
}

function normalizeRotation(value) {
  const full = Math.PI * 2;
  return ((value % full) + full) % full;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
