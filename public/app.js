
let map, socket, me, driverMarkers = {};
let routingControl;

function criarMapa(tipo) {
  // require login
  const user = localStorage.getItem('user');
  if(!user) return location.href = '/login.html';
  me = JSON.parse(user);
  document.getElementById('me') && (document.getElementById('me').innerText = me.username);

  map = L.map('map').setView([-15.788, -47.882], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(map);

  // connect websocket
  socket = new WebSocket('ws://localhost:3000');
  socket.onopen = () => {
    socket.send(JSON.stringify({type:'auth', username:me.username, role:me.role}));
    if(tipo === 'motorista') startSendingLocation();
  };
  socket.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    handleServerMessage(data);
  };

  if(tipo === 'cliente') setupClientUI();
  if(tipo === 'motorista') setupDriverUI();
}

function setupClientUI() {
  document.getElementById('logout').onclick = () => { localStorage.removeItem('user'); location.href='/login.html'; };
  document.getElementById('requestRide').onclick = async () => {
    const dest = document.getElementById('to').value.trim();
    if(!dest) return alert('Informe destino lat,lng');
    const [to_lat, to_lng] = dest.split(',').map(Number);
    // get current position
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const body = { client: me.username, from_lat: pos.coords.latitude, from_lng: pos.coords.longitude, to_lat, to_lng };
      const res = await fetch('/api/rides', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      const json = await res.json();
      document.getElementById('status').innerText = 'Corrida solicitada id: '+json.id;
    });
  };
}

function setupDriverUI() {
  document.getElementById('logout').onclick = () => { localStorage.removeItem('user'); location.href='/login.html'; };
  document.getElementById('sendChat').onclick = () => {
    const to = document.getElementById('chatTo').value.trim();
    const text = document.getElementById('chatText').value.trim();
    socket.send(JSON.stringify({type:'chat', from:me.username, to, text}));
  };
}

function startSendingLocation() {
  if(!navigator.geolocation) return alert('Geolocalização não suportada');
  navigator.geolocation.watchPosition((pos) => {
    const data = {type:'location', username:me.username, lat: pos.coords.latitude, lng: pos.coords.longitude};
    socket.send(JSON.stringify(data));
    updateDriverMarker(me.username, pos.coords.latitude, pos.coords.longitude);
  });
}

function updateDriverMarker(username, lat, lng) {
  if(driverMarkers[username]) {
    driverMarkers[username].setLatLng([lat,lng]);
  } else {
    driverMarkers[username] = L.marker([lat,lng]).addTo(map).bindPopup(username);
  }
}

function handleServerMessage(data) {
  switch(data.type) {
    case 'auth_ok':
      console.log('autenticado', data.username);
      break;
    case 'drivers_list':
      // update all driver markers
      const list = data.drivers || [];
      // remove markers not in list
      const present = new Set();
      list.forEach(d => {
        present.add(d.username);
        updateDriverMarker(d.username, d.lat, d.lng);
      });
      for(const u in driverMarkers) if(!present.has(u)) { map.removeLayer(driverMarkers[u]); delete driverMarkers[u]; }
      break;
    case 'ride_new':
      // driver: show in list
      if(me.role === 'driver') {
        const ul = document.getElementById('rides');
        const li = document.createElement('li');
        li.innerText = `ID ${data.ride.id} de ${data.ride.client} (${data.ride.from_lat.toFixed(4)},${data.ride.from_lng.toFixed(4)})`;
        const btnAccept = document.createElement('button');
        btnAccept.innerText='Aceitar';
        btnAccept.onclick = async () => {
          await fetch('/api/ride/respond', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({rideId:data.ride.id, driver:me.username, accept:true})});
        };
        li.appendChild(btnAccept);
        ul.appendChild(li);
      }
      break;
    case 'ride_update':
      // client sees update
      if(me.role === 'client') {
        document.getElementById('status').innerText = `Ride ${data.ride.id} status: ${data.ride.status} driver:${data.ride.driver}`;
      }
      break;
    case 'chat':
      alert(`Mensagem de ${data.from}: ${data.text}`);
      break;
    default:
      console.log('mensagem server', data);
  }
}
