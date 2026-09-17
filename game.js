// ---------- Motion Midway ----------
// A webcam-controlled balloon-pop game. No frameworks, no build step.
// Motion is detected by diffing consecutive low-res video frames on a
// small grid; balloons pop when enough motion happens in their cell.

const video = document.getElementById('video');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('startScreen');
const endScreen = document.getElementById('endScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const camStatus = document.getElementById('camStatus');
const scoreValueEl = document.getElementById('scoreValue');
const timeValueEl = document.getElementById('timeValue');
const finalScoreText = document.getElementById('finalScoreText');
const bestScoreText = document.getElementById('bestScoreText');

// Display resolution the game logic works in (canvas is scaled to this
// internally, then stretched to fill the stage via CSS).
const W = 640, H = 480;
canvas.width = W;
canvas.height = H;

// --- Motion detection setup ---
const GRID_W = 20, GRID_H = 15;      // coarse grid used for both diffing and balloon collision
const detectCanvas = document.createElement('canvas');
detectCanvas.width = GRID_W;
detectCanvas.height = GRID_H;
const detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true });

let prevFrame = null;
let motionGrid = new Float32Array(GRID_W * GRID_H);
const MOTION_THRESHOLD = 28;   // per-pixel brightness diff considered "moving"

const BALLOON_COLORS = ['#e6484f', '#2ec4b6', '#ffd23f', '#f2a541', '#7a67d8'];

let stream = null;
let balloons = [];
let particles = [];
let score = 0;
let timeLeft = 60;
let running = false;
let spawnTimer = 0;
let elapsed = 0;
let rafId = null;
let countdownId = null;

const BEST_KEY = 'motionMidwayBestScore';

// ---------- Camera setup ----------
async function startCamera() {
  camStatus.textContent = 'กำลังขอสิทธิ์ใช้กล้อง...';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: W }, height: { ideal: H }, facingMode: 'user' },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    camStatus.textContent = '';
    return true;
  } catch (err) {
    camStatus.textContent = 'ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้กล้องแล้วลองใหม่ (ต้องเปิดผ่าน http://localhost หรือ https)';
    return false;
  }
}

// ---------- Balloon helpers ----------
function spawnBalloon() {
  const radius = 26 + Math.random() * 22;          // 26–48 px
  const points = Math.round(60 - radius);           // smaller balloon = more points
  balloons.push({
    x: radius + Math.random() * (W - radius * 2),
    y: H + radius,
    radius,
    color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
    speed: 55 + Math.random() * 45 + elapsed * 1.2,  // gets faster as the round goes on
    points,
    wobble: Math.random() * Math.PI * 2
  });
}

function popBalloon(b) {
  score += b.points;
  scoreValueEl.textContent = score;
  for (let i = 0; i < 14; i++) {
    const angle = (Math.PI * 2 * i) / 14;
    particles.push({
      x: b.x, y: b.y,
      vx: Math.cos(angle) * (60 + Math.random() * 60),
      vy: Math.sin(angle) * (60 + Math.random() * 60),
      life: 0.5,
      color: b.color
    });
  }
}

// map a canvas x/y to a grid cell index
function gridIndexAt(x, y) {
  const gx = Math.min(GRID_W - 1, Math.max(0, Math.floor((x / W) * GRID_W)));
  const gy = Math.min(GRID_H - 1, Math.max(0, Math.floor((y / H) * GRID_H)));
  return gy * GRID_W + gx;
}

function motionNear(x, y) {
  const gx = Math.min(GRID_W - 1, Math.max(0, Math.floor((x / W) * GRID_W)));
  const gy = Math.min(GRID_H - 1, Math.max(0, Math.floor((y / H) * GRID_H)));
  let total = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = gx + dx, ny = gy + dy;
      if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) {
        total += motionGrid[ny * GRID_W + nx];
      }
    }
  }
  return total;
}

// ---------- Motion detection ----------
function updateMotionGrid() {
  // draw current (mirrored) frame small
  detectCtx.save();
  detectCtx.translate(GRID_W, 0);
  detectCtx.scale(-1, 1);
  detectCtx.drawImage(video, 0, 0, GRID_W, GRID_H);
  detectCtx.restore();

  const frame = detectCtx.getImageData(0, 0, GRID_W, GRID_H).data;

  if (prevFrame) {
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      const p = i * 4;
      const grey = (frame[p] + frame[p + 1] + frame[p + 2]) / 3;
      const prevGrey = (prevFrame[p] + prevFrame[p + 1] + prevFrame[p + 2]) / 3;
      const diff = Math.abs(grey - prevGrey);
      motionGrid[i] = diff > MOTION_THRESHOLD ? diff : 0;
    }
  }
  prevFrame = frame;
}

// ---------- Main loop ----------
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  elapsed += dt;

  updateMotionGrid();

  // spawn balloons with increasing frequency
  spawnTimer -= dt;
  const spawnInterval = Math.max(0.35, 1.1 - elapsed * 0.01);
  if (spawnTimer <= 0) {
    spawnBalloon();
    spawnTimer = spawnInterval;
  }

  // update balloons
  for (let i = balloons.length - 1; i >= 0; i--) {
    const b = balloons[i];
    b.y -= b.speed * dt;
    b.wobble += dt * 2;
    b.x += Math.sin(b.wobble) * 12 * dt;

    if (motionNear(b.x, b.y) > 90) {
      popBalloon(b);
      balloons.splice(i, 1);
      continue;
    }
    if (b.y < -b.radius) balloons.splice(i, 1);
  }

  // update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 140 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  draw();

  if (running) rafId = requestAnimationFrame(loop);
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // mirrored webcam background
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, W, H);
  }
  ctx.restore();

  // navy tint so carnival colors read clearly over any background
  ctx.fillStyle = 'rgba(14, 17, 36, 0.38)';
  ctx.fillRect(0, 0, W, H);

  // balloons
  for (const b of balloons) {
    drawBalloon(b);
  }

  // particles
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.5);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawBalloon(b) {
  ctx.save();
  ctx.translate(b.x, b.y);

  // string
  ctx.strokeStyle = 'rgba(255,248,231,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, b.radius);
  ctx.lineTo(0, b.radius + 16);
  ctx.stroke();

  // balloon body
  ctx.beginPath();
  ctx.ellipse(0, 0, b.radius * 0.82, b.radius, 0, 0, Math.PI * 2);
  ctx.fillStyle = b.color;
  ctx.fill();

  // highlight
  ctx.beginPath();
  ctx.ellipse(-b.radius * 0.28, -b.radius * 0.4, b.radius * 0.22, b.radius * 0.32, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();

  // knot
  ctx.beginPath();
  ctx.moveTo(-4, b.radius - 2);
  ctx.lineTo(4, b.radius - 2);
  ctx.lineTo(0, b.radius + 6);
  ctx.closePath();
  ctx.fillStyle = b.color;
  ctx.fill();

  ctx.restore();
}

// ---------- Game flow ----------
function resetState() {
  balloons = [];
  particles = [];
  score = 0;
  timeLeft = 60;
  elapsed = 0;
  spawnTimer = 0;
  prevFrame = null;
  scoreValueEl.textContent = '0';
  timeValueEl.textContent = '60';
}

async function beginGame() {
  startScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  resetState();

  if (!stream) {
    const ok = await startCamera();
    if (!ok) {
      startScreen.classList.remove('hidden');
      return;
    }
  }

  running = true;
  lastTime = performance.now();
  rafId = requestAnimationFrame(loop);

  countdownId = setInterval(() => {
    timeLeft -= 1;
    timeValueEl.textContent = String(Math.max(0, timeLeft));
    if (timeLeft <= 0) endGame();
  }, 1000);
}

function endGame() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  if (countdownId) clearInterval(countdownId);

  const best = Number(localStorage.getItem(BEST_KEY) || 0);
  const newBest = Math.max(best, score);
  localStorage.setItem(BEST_KEY, String(newBest));

  finalScoreText.textContent = `คุณได้ ${score} ตั๋ว`;
  bestScoreText.textContent = `สถิติสูงสุด: ${newBest} ตั๋ว`;
  endScreen.classList.remove('hidden');
}

startBtn.addEventListener('click', beginGame);
restartBtn.addEventListener('click', beginGame);
