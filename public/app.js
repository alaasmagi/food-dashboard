const dashboard = document.querySelector("#dashboard");
const statusEl = document.querySelector("#status");
const updatedEl = document.querySelector("#updated");
const refreshButton = document.querySelector("#refresh");

refreshButton.addEventListener("click", () => loadDashboard());

loadDashboard();

async function loadDashboard() {
  setLoading(true);

  try {
    const response = await fetch("/api/menu", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`API vastas staatusega ${response.status}`);
    }

    const data = await response.json();
    renderDashboard(data);
    statusEl.textContent = "Valmis";
    updatedEl.textContent = `Viimati uuendatud ${formatTime(data.generatedAt)}`;
  } catch (error) {
    statusEl.textContent = "Viga";
    dashboard.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? "Laen..." : "Värskenda";
  statusEl.textContent = isLoading ? "Laen pakkumisi..." : statusEl.textContent;

  if (isLoading && !dashboard.children.length) {
    dashboard.innerHTML = `
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    `;
  }
}

function renderDashboard(data) {
  dashboard.innerHTML = data.environments.map((environment) => `
    <section class="environment">
      <div class="environment-header">
        <div>
          <h2>${escapeHtml(environment.name)}</h2>
          <p class="environment-description">${escapeHtml(environment.description || "")}</p>
        </div>
        <span class="pill">${environment.restaurants.length}</span>
      </div>
      <div class="restaurant-list">
        ${environment.restaurants.map(renderRestaurant).join("")}
      </div>
    </section>
  `).join("");
}

function renderRestaurant(item) {
  const hasError = Boolean(item.error);
  const meta = [
    item.offerTime,
    item.dateText,
    item.parking ? `Parkimine: ${item.parking}` : null
  ].filter(Boolean);

  return `
    <article class="restaurant ${hasError ? "has-error" : ""}">
      <header class="restaurant-head">
        <div>
          <h3>${escapeHtml(item.title || item.restaurant.name)}</h3>
          <div class="meta">
            ${meta.map((value) => `<span class="pill">${escapeHtml(value)}</span>`).join("")}
            ${item.cached ? `<span class="pill warn">cache ${formatAge(item.cacheAgeSeconds)}</span>` : `<span class="pill">värske</span>`}
            ${item.stale ? `<span class="pill warn">aegunud</span>` : ""}
            ${hasError ? `<span class="pill error">viga</span>` : ""}
          </div>
        </div>
        <a class="source" href="${escapeAttribute(item.sourceUrl)}" target="_blank" rel="noreferrer">Allikas</a>
      </header>
      ${hasError ? `<p class="error-text">${escapeHtml(item.error)}</p>` : ""}
      ${renderOffers(item)}
      ${item.footer ? `<p class="footer-note">${escapeHtml(item.footer)}</p>` : ""}
    </article>
  `;
}

function renderOffers(item) {
  if (!item.offers?.length) {
    return `<p class="empty">Pakkumisi ei leitud.</p>`;
  }

  return `
    <ul class="offers">
      ${item.offers.map((offer) => `
        <li class="offer">
          <span class="offer-text">${escapeHtml(offer.text)}</span>
          ${offer.price ? `<span class="price">${escapeHtml(offer.price)}</span>` : ""}
        </li>
      `).join("")}
    </ul>
  `;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("et-EE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatAge(seconds = 0) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
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
