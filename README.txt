
Projeto: meu-app-mobilidade-completo
===================================

Este projeto é um demo completo que implementa várias funcionalidades:
- Autenticação (registro/login) usando SQLite
- Múltiplos motoristas no mapa (drivers list)
- Sistema de pedido de corrida (cliente solicita, drivers recebem e um pode aceitar)
- Cálculo de rota (frontend usa Leaflet Routing Machine + OSRM public)
- Chat em tempo real entre usuários via WebSocket
- Banco de dados local (SQLite) para usuários e rides
- PWA básico (manifest + service-worker) para instalar no celular
- WebSocket robusto com mensagens tipadas (auth, location, ride events, chat)

Arquivos importantes:
- server.js: servidor Node.js que expõe APIs REST e WebSocket, conecta SQLite.
- public/login.html: tela de registro/login.
- public/index.html: app cliente (cliente de corrida).
- public/driver.html: app motorista.
- public/app.js: código cliente compartilhado (WebSocket, mapa, lógica).
- public/manifest.json e public/service-worker.js: PWA.
- data.db: arquivo SQLite (criado no runtime).
- package.json: dependências.

Observações de segurança / produção:
- Senhas são armazenadas em texto neste exemplo para simplicidade. Em produção use hashing (bcrypt) e HTTPS.
- TURN não está configurado: WebRTC não está sendo usado neste demo. O projeto usa WebSocket.
- Para expor o servidor para a internet você precisa IP público ou um túnel (ngrok, cloudflared) ou hospedar em VPS.
- OSRM público é usado pelo Leaflet Routing Machine; não use em produção sem considerar limites.

Como rodar:
1) npm install
2) node server.js
3) abra http://localhost:3000/login.html
4) registre um usuário motorista e um cliente (roles)
5) entre com motorista em /driver.html (comece a enviar localização)
6) entre com cliente em / (index.html) e peça corrida

Descrição das funcionalidades (detalhada):
- Autenticação:
  Endpoints REST:
    POST /api/register {username,password,role}
    POST /api/login {username,password}
  Salva no banco SQLite. No cliente, o usuário salvo em localStorage.

- Múltiplos motoristas:
  Via WebSocket: quando motorista autentica, servidor registra na lista 'drivers' e atualiza os outros clientes com mensagem type 'drivers_list' contendo lat/lng de cada motorista. Marcadores no mapa são atualizados em tempo real.

- Sistema de pedido de corrida:
  Cliente chama POST /api/rides com from/to; servidor cria ride no DB e broadcast 'ride_new'. Motoristas recebem e podem aceitar com POST /api/ride/respond ou via mensagem websocket 'ride_response'. Ao aceitar, servidor atualiza DB e broadcast 'ride_update'.

- Cálculo de rota:
  No cliente, usamos Leaflet Routing Machine (biblioteca JS) que aponta para um roteador OSRM público (padrão) para desenhar rota entre pontos. Este demo não faz requisição direta para OSRM no código (a LRM faz).

- Chat:
  Mensagens tipo 'chat' enviadas via WebSocket; servidor tenta entregar diretamente ao destinatário (se conectado) ou faz broadcast.

- Banco local (SQLite):
  Arquivos criados automaticamente; tabelas: users, rides.

- PWA:
  Manifest básico e service worker (cache simples) permitem instalar no celular.

Limitations & next steps:
- Adicionar hashing de senha e HTTPS.
- Configurar TURN se for usar WebRTC em ambiente real.
- Implementar rate-limiting, autenticação JWT para sockets, e validações.
- Mover para VPS para suportar conexões externas.

