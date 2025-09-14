/******************************
 * CONFIG
 ******************************/
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; // 🔑 replace with your real key
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const OPEN_METEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";

/******************************
 * DOM
 ******************************/
const els = {
  cityInput: document.getElementById("cityInput"),
  searchBtn: document.getElementById("searchBtn"),
  geoBtn: document.getElementById("geoBtn"),
  unitBtns: document.querySelectorAll(".unit"),
  cityName: document.getElementById("cityName"),
  localTime: document.getElementById("localTime"),
  temperature: document.getElementById("temperature"),
  condition: document.getElementById("condition"),
  hiLo: document.getElementById("hiLo"),
  feelsLike: document.getElementById("feelsLike"),
  humidity: document.getElementById("humidity"),
  wind: document.getElementById("wind"),
  pressure: document.getElementById("pressure"),
  windDir: document.getElementById("windDir"),
  precip: document.getElementById("precip"),
  sunrise: document.getElementById("sunrise"),
  sunset: document.getElementById("sunset"),
  uv: document.getElementById("uv"),
  visibility: document.getElementById("visibility"),
  forecastRow: document.getElementById("forecastRow"),
  aiOut: document.getElementById("aiOutput"),
  aiRefresh: document.getElementById("aiRefresh"),
};
let unit = "c";
let chart;

/******************************
 * HELPERS
 ******************************/
const cToF = c => (c * 9/5) + 32;
const maybeF = c => unit === "f" ? `${Math.round(cToF(c))}°F` : `${Math.round(c)}°C`;
const dayName = iso => new Date(iso).toLocaleDateString(undefined,{weekday:"short"});
const fmtTime = (s, tz) => new Date(s).toLocaleString(undefined,{hour:"2-digit",minute:"2-digit",timeZone:tz||undefined});

/******************************
 * AI (Gemini Summary)
 ******************************/
async function aiSummary(payload) {
  const prompt = `
Summarize this weather for users in 3-4 friendly lines.
Use Celsius if unit="c", Fahrenheit if "f".
DATA: ${JSON.stringify(payload)}
  `.trim();

  try {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: prompt,
        temperature: 0.7,
        max_output_tokens: 200
      })
    });

    const data = await res.json();
    // Gemini v1beta typically returns: data.candidates[0].content OR data.output_text
    return data?.candidates?.[0]?.content || data?.output_text || "AI summary unavailable.";
  } catch (e) {
    console.error(e);
    return "AI request failed.";
  }
}


/******************************
 * WEATHER FETCH
 ******************************/
async function geocodeCity(name){
  const url = `${OPEN_METEO_GEOCODE}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const r = await fetch(url);
  const j = await r.json();
  if (!j?.results?.length) throw new Error("City not found");
  const g = j.results[0];
  return { lat: g.latitude, lon: g.longitude, name: g.name, country: g.country, timezone: g.timezone };
}

async function fetchForecast(lat, lon, tz){
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum",
    hourly: "temperature_2m",
    timezone: tz || "auto",
    forecast_days: "7"
  });
  return await (await fetch(`${OPEN_METEO_FORECAST}?${params}`)).json();
}

/******************************
 * UI RENDER
 ******************************/
function renderCurrent(meta, data){
  const cur = data.current;
  els.cityName.textContent = `${meta.name}, ${meta.country}`;
  els.localTime.textContent = fmtTime(cur.time, meta.timezone);
  els.temperature.textContent = maybeF(cur.temperature_2m);
  els.condition.textContent = `Code ${cur.weather_code || "—"}`;
  els.hiLo.textContent = `H: ${maybeF(data.daily.temperature_2m_max[0])} / L: ${maybeF(data.daily.temperature_2m_min[0])}`;
  els.feelsLike.textContent = maybeF(cur.apparent_temperature);
  els.humidity.textContent = `${cur.relative_humidity_2m}%`;
  els.wind.textContent = `${Math.round(cur.wind_speed_10m)} km/h`;
  els.pressure.textContent = `${Math.round(cur.pressure_msl)} hPa`;
  els.windDir.textContent = `${cur.wind_direction_10m}°`;
  els.sunrise.textContent = fmtTime(data.daily.sunrise[0], meta.timezone);
  els.sunset.textContent = fmtTime(data.daily.sunset[0], meta.timezone);
  els.precip.textContent = `${data.hourly.precipitation?.[0] || 0} mm`;
  els.uv.textContent = data.daily.uv_index_max[0];
  els.visibility.textContent = `${Math.round(data.hourly.visibility?.[0]/1000)||0} km`;
}

function renderForecast(data){
  els.forecastRow.innerHTML = "";
  data.daily.time.slice(0,5).forEach((iso,i)=>{
    const card = document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <div class="day">${dayName(iso)}</div>
      <div class="temp">${maybeF(data.daily.temperature_2m_min[i])} / <b>${maybeF(data.daily.temperature_2m_max[i])}</b></div>
    `;
    els.forecastRow.appendChild(card);
  });
}

/******************************
 * CONTROLLER
 ******************************/
async function loadCityByName(name){
  try{
    setAI("Loading...");
    const meta = await geocodeCity(name);
    const fc = await fetchForecast(meta.lat, meta.lon, meta.timezone);
    renderCurrent(meta, fc);
    renderForecast(fc);

    const payload = { place: `${meta.name}, ${meta.country}`, unit, now: fc.current, today: { high: fc.daily.temperature_2m_max[0], low: fc.daily.temperature_2m_min[0], uv: fc.daily.uv_index_max[0], precip: fc.daily.precipitation_sum[0] } };
    setAI(await aiSummary(payload));
  }catch(e){ setAI("City not found."); console.error(e); }
}

function setAI(text) {
  if (els.aiOut) {
    els.aiOut.textContent = text;
  } else {
    console.warn("AI output element not found!");
  }
}


/******************************
 * EVENTS
 ******************************/
els.searchBtn.onclick=()=>{ if(els.cityInput.value.trim()) loadCityByName(els.cityInput.value.trim()); };
els.cityInput.onkeydown=e=>{ if(e.key==="Enter") els.searchBtn.click(); };
els.geoBtn.onclick=()=>alert("Geolocation fetch skipped in simplified version."); // keep simple
els.unitBtns.forEach(btn=>btn.onclick=()=>{
  els.unitBtns.forEach(b=>b.classList.remove("active"));
  btn.classList.add("active"); unit=btn.dataset.unit;
  if(els.cityName.textContent!=="—") loadCityByName(els.cityName.textContent.split(",")[0]);
});
els.aiRefresh.onclick=()=>{ if(els.cityName.textContent!=="—") loadCityByName(els.cityName.textContent.split(",")[0]); };

/******************************
 * INIT
 ******************************/
document.addEventListener("DOMContentLoaded", ()=> loadCityByName("Gwalior"));
