// Map Initialization
let map;
let markers = {};
let authCode = '';

const initMap = () => {
    map = L.map('map', {zoomControl: false}).setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);
};

// UI Elements
const loginModal = document.getElementById('login-modal');
const dashboard = document.getElementById('dashboard');
const loginBtn = document.getElementById('login-btn');
const loginBtnText = document.getElementById('login-btn-text');
const loginSpinner = document.getElementById('login-spinner');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');
const evList = document.getElementById('ev-list');
const evSelector = document.getElementById('ev-selector');
const sendMsgBtn = document.getElementById('send-msg-btn');
const msgStatus = document.getElementById('msg-status');
const userNameInput = document.getElementById('user-name-input');
const userLocationInput = document.getElementById('user-location-input');

let pollTimer = null;

// ── Login Handler ────────────────────────────────────────────────────────────
const handleLogin = async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    loginError.textContent = '';

    if (!username || !password) {
        loginError.textContent = 'Please enter both username and password.';
        shakeElement(loginError);
        return;
    }

    loginBtn.disabled = true;
    loginBtnText.textContent = 'Authenticating...';
    loginSpinner.classList.remove('hidden');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (res.ok) {
            authCode = btoa(`${username}:${password}`);

            loginModal.style.opacity = '0';
            setTimeout(() => {
                loginModal.classList.add('hidden');
                dashboard.classList.remove('hidden');
                if (!map) initMap();
                fetchEVLocations();
                if (pollTimer) clearInterval(pollTimer);
                pollTimer = setInterval(fetchEVLocations, 1000);
            }, 400);
        } else {
            const err = await res.json();
            loginError.textContent = err.detail || 'Invalid username or password.';
            shakeElement(loginError);
            loginBtn.disabled = false;
            loginBtnText.textContent = 'Authenticate';
            loginSpinner.classList.add('hidden');
        }
    } catch (e) {
        loginError.textContent = 'Network error. Is the server running?';
        shakeElement(loginError);
        loginBtn.disabled = false;
        loginBtnText.textContent = 'Authenticate';
        loginSpinner.classList.add('hidden');
    }
};

const shakeElement = (el) => {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
};

loginBtn.addEventListener('click', handleLogin);

usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') passwordInput.focus();
});
passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// Custom Icon
const customIcon = L.divIcon({
    className: 'ev-marker',
    iconSize: [16, 16]
});

// ── Fetch EV Locations (authenticated) ───────────────────────────────────────
const fetchEVLocations = async () => {
    try {
        const res = await fetch('/api/evs', {
            headers: { 'Authorization': `Basic ${authCode}` }
        });
        if (!res.ok) {
            if (res.status === 401) {
                if (pollTimer) clearInterval(pollTimer);
                dashboard.classList.add('hidden');
                loginModal.classList.remove('hidden');
                loginModal.style.opacity = '1';
                loginBtn.disabled = false;
                loginBtnText.textContent = 'Authenticate';
                loginSpinner.classList.add('hidden');
                loginError.textContent = 'Session expired. Please log in again.';
                return;
            }
            throw new Error('API Error');
        }
        const data = await res.json();
        updateMapAndSidebar(data);
    } catch (e) {
        console.error("Failed to fetch EV data", e);
    }
};

// ── Update Map & Sidebar ─────────────────────────────────────────────────────
const updateMapAndSidebar = (evs) => {
    evList.innerHTML = '';
    const currentSelection = evSelector.value;
    evSelector.innerHTML = '<option value="">Select EV...</option>';

    evs.forEach(ev => {
        const popup = `<b>${ev.ev_id}</b><br>Last seen: ${new Date(ev.timestamp).toLocaleTimeString()}`;
        if (markers[ev.ev_id]) {
            markers[ev.ev_id].setLatLng([ev.lat, ev.lng]);
            markers[ev.ev_id]._popup.setContent(popup);
        } else {
            markers[ev.ev_id] = L.marker([ev.lat, ev.lng], {icon: customIcon})
                .bindPopup(popup)
                .addTo(map);
        }

        const li = document.createElement('li');
        li.className = 'ev-item';
        li.innerHTML = `
            <h4>${ev.ev_id}</h4>
            <p>Lat: ${ev.lat.toFixed(4)}, Lng: ${ev.lng.toFixed(4)}</p>
        `;
        li.addEventListener('click', () => {
            map.flyTo([ev.lat, ev.lng], 16);
            evSelector.value = ev.ev_id;
        });
        evList.appendChild(li);

        const option = document.createElement('option');
        option.value = ev.ev_id;
        option.textContent = ev.ev_id;
        evSelector.appendChild(option);
    });

    if (evs.some(e => e.ev_id === currentSelection)) {
        evSelector.value = currentSelection;
    }
};

// ── Send Call Signal (authenticated) ─────────────────────────────────────────
sendMsgBtn.addEventListener('click', async () => {
    const evId = evSelector.value;
    const userName = userNameInput.value.trim();
    const userLocation = userLocationInput.value.trim();

    if (!evId || !userName || !userLocation) {
        msgStatus.textContent = "Select an EV and enter user name and location.";
        msgStatus.style.color = "var(--danger)";
        return;
    }

    try {
        sendMsgBtn.disabled = true;
        msgStatus.textContent = "Sending...";
        msgStatus.style.color = "var(--text-secondary)";

        const res = await fetch('/api/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authCode}`
            },
            body: JSON.stringify({ ev_id: evId, message: "CALL", user: userName, location: userLocation })
        });

        if (res.ok) {
            msgStatus.textContent = "Call Signal Dispatched!";
            msgStatus.style.color = "var(--success)";
            userNameInput.value = '';
            userLocationInput.value = '';
        } else {
            const err = await res.json();
            msgStatus.textContent = err.detail || "Authentication Failed!";
            msgStatus.style.color = "var(--danger)";
        }
    } catch (e) {
        msgStatus.textContent = "Network error";
        msgStatus.style.color = "var(--danger)";
    } finally {
        sendMsgBtn.disabled = false;
        setTimeout(() => { if (msgStatus.style.color === "var(--success)") msgStatus.textContent = ""; }, 3000);
    }
});