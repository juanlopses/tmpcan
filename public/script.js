const socket = io();
let roomId, localStream;
let usingFront = true;
let host = false;
let uiHidden = false;
let lastSentPing = 0;

function createRoom() {
  roomId = document.getElementById('roomId').value.trim();
  if (!roomId) return alert('Ingresa un ID');
  host = true;
  socket.emit('create-room', { roomId });
}

function joinRoom() {
  roomId = document.getElementById('roomId').value.trim();
  if (!roomId) return alert('Ingresa un ID');
  host = false;
  socket.emit('join-room', { roomId });
}

socket.on('room-exists', () => {
  document.getElementById('feedback').innerText = '❌ ID ya está en uso';
});

socket.on('room-created', () => initLive(true));
socket.on('no-room', () => alert('❌ Sala no encontrada'));

async function initLive(isHost) {
  document.body.innerHTML = `
    <div id="container" class="relative w-full h-screen bg-black">
      <video id="video" autoplay playsinline class="w-full h-full object-contain"></video>
      <div id="controls" class="absolute bottom-4 left-4 space-x-2 bg-black/50 p-2 rounded">
        ${host ? `
          <button id="camBtn">📷</button>
          <button id="micBtn">🎤</button>
          <button id="switchBtn">🔄 Cam</button>` : ''}
        <button id="cleanBtn">🕶️ Modo limpio</button>
        <span id="pingUser" class="ml-2"></span>
        <span id="pingHost" class="ml-2"></span>
        <span id="viewCount" class="ml-2"></span>
      </div>
    </div>`;

  const video = document.getElementById('video');
  if (isHost) {
    localStream = await startCamera();
    video.srcObject = localStream;
    setupHostControls();
    measureHostPing();
  } else {
    socket.emit('ping-host');
    socket.on('update-host-ping', ({ ping }) => {
      document.getElementById('pingHost').innerText = `Live: ${ping}ms`;
    });
    setInterval(() => {
      lastSentPing = Date.now();
      socket.emit('ping-host');
    }, 4000);
  }

  socket.on('viewer-count', (count) => {
    document.getElementById('viewCount').innerText = `👥 ${count}`;
  });
}

async function startCamera() {
  usingFront = true;
  return await fetchCameraStream();
}

async function fetchCameraStream() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter(d => d.kind === 'videoinput');
  const cam = usingFront ? cams.find(d => /front/i.test(d.label)) : cams.find(d => /back|rear|environment/i.test(d.label));
  const stream = await navigator.mediaDevices.getUserMedia({
    video: cam ? { deviceId: cam.deviceId } : true,
    audio: true
  });
  localStream = stream;
  return stream;
}

function setupHostControls() {
  document.getElementById('camBtn').onclick = toggleCamera;
  document.getElementById('micBtn').onclick = toggleMic;
  document.getElementById('switchBtn').onclick = switchCamera;
  document.getElementById('cleanBtn').onclick = toggleUI;

  socket.on('pong-host', () => {
    const now = Date.now();
    const ping = now - lastSentPing;
    document.getElementById('pingUser').innerText = `Tú: ${ping}ms`;
  });
}

function toggleMic() {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  document.getElementById('micBtn').innerText = track.enabled ? '🎤' : '🔇';
}

function toggleCamera() {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  document.getElementById('camBtn').innerText = track.enabled ? '📷' : '🚫📷';
}

async function switchCamera() {
  usingFront = !usingFront;
  const stream = await fetchCameraStream();
  const vTrack = stream.getVideoTracks()[0];
  localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
  localStream.addTrack(vTrack);
}

function toggleUI() {
  uiHidden = !uiHidden;
  document.getElementById('controls').style.display = uiHidden ? 'none' : 'flex';
}
