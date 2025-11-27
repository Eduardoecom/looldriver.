
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");

// --- DB setup (SQLite) ---
const dbFile = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbFile);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS rides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client TEXT,
    driver TEXT,
    from_lat REAL,
    from_lng REAL,
    to_lat REAL,
    to_lng REAL,
    status TEXT
  );`);
});

// --- Express app ---
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Simple auth endpoints (NOTE: passwords stored plaintext for demo — replace with hashing for production)
app.post('/api/register', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({error: 'missing fields'});
  db.run("INSERT INTO users(username,password,role) VALUES(?,?,?)", [username, password, role], function(err) {
    if (err) return res.status(400).json({error: 'username exists'});
    res.json({id: this.lastID, username, role});
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT id,username,role FROM users WHERE username=? AND password=?", [username, password], (err, row) => {
    if (err) return res.status(500).json({error:'db error'});
    if (!row) return res.status(401).json({error:'invalid credentials'});
    res.json({id: row.id, username: row.username, role: row.role});
  });
});

app.post('/api/rides', (req, res) => {
  const { client, from_lat, from_lng, to_lat, to_lng } = req.body;
  db.run("INSERT INTO rides(client,driver,from_lat,from_lng,to_lat,to_lng,status) VALUES(?,?,?,?,?,?,?)",
    [client, "", from_lat, from_lng, to_lat, to_lng, "requested"], function(err) {
      if (err) return res.status(500).json({error:'db'});
      const rideId = this.lastID;
      // Broadcast to all connected drivers via WebSocket (server will also notify)
      broadcast(JSON.stringify({type:'ride_new', ride:{id:rideId, client, from_lat, from_lng, to_lat, to_lng, status:'requested'}}));
      res.json({id: rideId});
    });
});

app.post('/api/ride/respond', (req, res) => {
  const { rideId, driver, accept } = req.body;
  const status = accept ? 'accepted' : 'rejected';
  db.run("UPDATE rides SET driver=?, status=? WHERE id=?", [driver, status, rideId], function(err) {
    if (err) return res.status(500).json({error:'db'});
    // Notify clients
    broadcast(JSON.stringify({type:'ride_update', ride:{id:rideId, driver, status}}));
    res.json({ok:true});
  });
});

// --- HTTP + WebSocket server ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Map(); // ws -> meta {username,role}
let drivers = new Map(); // username -> {lat,lng,ws}

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

wss.on('connection', (ws) => {
  console.log('ws connected');
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      handleMessage(ws, data);
    } catch(e) {
      console.error('invalid ws msg', e);
    }
  });
  ws.on('close', () => {
    // remove from clients/drivers
    for (let [k, v] of clients.entries()) if (v.ws === ws) clients.delete(k);
    for (let [name, info] of drivers.entries()) if (info.ws === ws) drivers.delete(name);
    broadcast(JSON.stringify({type:'drivers_list', drivers: Array.from(drivers.entries()).map(([u,i])=>({username:u,lat:i.lat,lng:i.lng}))}));
  });
});

function handleMessage(ws, data) {
  switch(data.type) {
    case 'auth':
      // data: {username, role}
      clients.set(data.username, {username:data.username, role:data.role, ws});
      if (data.role === 'driver') {
        drivers.set(data.username, {lat:0, lng:0, ws});
      }
      // send current drivers list
      ws.send(JSON.stringify({type:'auth_ok', username:data.username, role:data.role}));
      broadcast(JSON.stringify({type:'drivers_list', drivers: Array.from(drivers.entries()).map(([u,i])=>({username:u,lat:i.lat,lng:i.lng}))}));
      break;
    case 'location':
      // data: {username, lat, lng}
      if (drivers.has(data.username)) {
        drivers.get(data.username).lat = data.lat;
        drivers.get(data.username).lng = data.lng;
        drivers.get(data.username).ws = ws;
        broadcast(JSON.stringify({type:'drivers_list', drivers: Array.from(drivers.entries()).map(([u,i])=>({username:u,lat:i.lat,lng:i.lng}))}));
      }
      break;
    case 'chat':
      // data: {from, to, text}
      // forward to recipient if connected, else broadcast
      let sent = false;
      for (let [u, info] of clients.entries()) {
        if (u === data.to && info.ws.readyState === WebSocket.OPEN) {
          info.ws.send(JSON.stringify({type:'chat', from:data.from, text:data.text}));
          sent = true;
        }
      }
      if (!sent) broadcast(JSON.stringify({type:'chat', from:data.from, text:data.text}));
      break;
    case 'ride_response':
      // data: {rideId, driver, accept}
      // update DB and broadcast
      db.run("UPDATE rides SET driver=?, status=? WHERE id=?", [data.driver, data.accept ? 'accepted' : 'rejected', data.rideId], function(err) {
        if (err) console.error(err);
        broadcast(JSON.stringify({type:'ride_update', ride:{id:data.rideId, driver:data.driver, status: data.accept ? 'accepted' : 'rejected'}}));
      });
      break;
    default:
      console.log('unknown ws type', data.type);
  }
}

server.listen(8080, () => {
  console.log("Servidor rodando em http://localhost:8080");
});
