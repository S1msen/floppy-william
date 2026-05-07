// ===== Floppy William =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");

let best = +(localStorage.getItem("floppyWilliamBest") || 0);
bestEl.textContent = best;

// ---------- Asset loading ----------
const bgImg = new Image();
bgImg.src = "bg.jpg";

const birdRaw = new Image();
birdRaw.src = "bird.png";

let birdImg = null; // processed transparent version

function makeTransparent(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext("2d");
  cx.drawImage(img, 0, 0);
  const data = cx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const W = c.width, H = c.height;

  // If the image already has meaningful transparency (e.g. PNG with alpha),
  // skip processing and use it as-is.
  let transparentPixels = 0;
  const sampleStep = 4 * 50; // sample every 50th pixel for speed
  for (let i = 3; i < px.length; i += sampleStep) {
    if (px[i] < 250) transparentPixels++;
  }
  if (transparentPixels > 5) {
    return c; // already transparent, use original
  }

  // Sample a few corners to estimate background color (average)
  const corners = [
    [0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1],
    [Math.floor(W / 2), 0], [Math.floor(W / 2), H - 1],
    [0, Math.floor(H / 2)], [W - 1, Math.floor(H / 2)],
  ];
  let br = 0, bg = 0, bb = 0;
  for (const [x, y] of corners) {
    const i = (y * W + x) * 4;
    br += px[i]; bg += px[i + 1]; bb += px[i + 2];
  }
  br /= corners.length; bg /= corners.length; bb /= corners.length;

  const tol = 60; // color similarity tolerance
  const tol2 = tol * tol;

  function similar(i) {
    const dr = px[i] - br, dgc = px[i + 1] - bg, db = px[i + 2] - bb;
    return dr * dr + dgc * dgc + db * db < tol2;
  }

  // BFS flood from every edge pixel that matches the bg color
  const visited = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) {
    stack.push(x, 0);
    stack.push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    stack.push(0, y);
    stack.push(W - 1, y);
  }

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const idx = y * W + x;
    if (visited[idx]) continue;
    const i = idx * 4;
    if (!similar(i)) continue;
    visited[idx] = 1;
    px[i + 3] = 0; // make transparent
    stack.push(x + 1, y);
    stack.push(x - 1, y);
    stack.push(x, y + 1);
    stack.push(x, y - 1);
  }

  // Soften edges: any opaque pixel adjacent to a transparent one gets reduced alpha
  const original = new Uint8ClampedArray(px); // copy alphas
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const i = idx * 4;
      if (original[i + 3] === 0) continue;
      // count transparent neighbors
      let t = 0;
      if (original[((y - 1) * W + x) * 4 + 3] === 0) t++;
      if (original[((y + 1) * W + x) * 4 + 3] === 0) t++;
      if (original[(y * W + x - 1) * 4 + 3] === 0) t++;
      if (original[(y * W + x + 1) * 4 + 3] === 0) t++;
      if (t > 0) px[i + 3] = Math.max(0, 255 - t * 60);
    }
  }

  cx.putImageData(data, 0, 0);
  return c;
}

let assetsReady = 0;
const ASSETS_TOTAL = 2;
function assetLoaded() {
  assetsReady++;
  if (assetsReady === ASSETS_TOTAL) {
    // bird.png already has transparent background, use it directly
    birdImg = birdRaw;
    drawIdle();
  }
}
bgImg.onload = assetLoaded;
birdRaw.onload = assetLoaded;
bgImg.onerror = () => console.error("Failed to load bg.jpg");
birdRaw.onerror = () => console.error("Failed to load bird.png");

// ---------- Game state ----------
const GRAVITY = 0.45;
const FLAP = -8;
const PIPE_GAP = 170;
const PIPE_SPEED = 2.6;
const PIPE_INTERVAL = 110; // frames

let bird, pipes, frame, score, gameState, particles, presents, bgX;

function reset() {
  bird = { x: 110, y: H / 2, vy: 0, r: 26, angle: 0, spin: 0 };
  pipes = [];
  presents = [];
  particles = [];
  frame = 0;
  score = 0;
  bgX = 0;
  scoreEl.textContent = 0;
  gameState = "ready";
}

reset();

// ---------- Input ----------
function flap() {
  if (gameState === "ready") {
    gameState = "playing";
    overlay.classList.add("hidden");
  }
  if (gameState === "playing") {
    bird.vy = FLAP;
    bird.spin = -0.45; // big spin on flap
    spawnFlapParticles();
  } else if (gameState === "dead") {
    showOverlay("Try again!", `You scored ${score} 🎂<br/>Best: ${best}`);
    reset();
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); flap(); }
});
canvas.addEventListener("mousedown", flap);
canvas.addEventListener("touchstart", (e) => { e.preventDefault(); flap(); }, { passive: false });
startBtn.addEventListener("click", () => {
  overlay.classList.add("hidden");
  if (gameState === "dead") reset();
  gameState = "playing";
});

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.innerHTML = text;
  overlay.classList.remove("hidden");
}

// ---------- Entities ----------
function spawnPipe() {
  const margin = 60;
  const gapY = margin + Math.random() * (H - PIPE_GAP - margin * 2);
  pipes.push({ x: W + 20, gapY, passed: false });

  // 30% chance to spawn a present in the gap
  if (Math.random() < 0.35) {
    presents.push({
      x: W + 20 + 26,
      y: gapY + PIPE_GAP / 2,
      r: 16,
      collected: false,
      bob: Math.random() * Math.PI * 2,
    });
  }
}

function spawnFlapParticles() {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: bird.x - 10,
      y: bird.y + 10,
      vx: -1 - Math.random() * 1.5,
      vy: (Math.random() - 0.5) * 2,
      life: 30,
      color: ["#ff4fa3", "#ffd84f", "#a0e7ff", "#fff"][Math.floor(Math.random() * 4)],
      size: 3 + Math.random() * 3,
    });
  }
}

function spawnConfetti() {
  for (let i = 0; i < 30; i++) {
    particles.push({
      x: bird.x,
      y: bird.y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6 - 2,
      life: 60,
      color: ["#ff4fa3", "#ffd84f", "#a0e7ff", "#c5a0ff", "#7CFC00"][Math.floor(Math.random() * 5)],
      size: 4 + Math.random() * 4,
      gravity: 0.15,
    });
  }
}

// ---------- Update ----------
function update() {
  if (gameState !== "playing") return;
  frame++;
  bgX -= 0.5;

  // Bird physics
  bird.vy += GRAVITY;
  bird.y += bird.vy;

  // Constant spin while flying + extra spin from flaps decaying
  bird.angle += 0.12 + bird.spin;
  bird.spin *= 0.9;

  // Pipes
  if (frame % PIPE_INTERVAL === 0) spawnPipe();
  for (const p of pipes) {
    p.x -= PIPE_SPEED;
    if (!p.passed && p.x + 40 < bird.x) {
      p.passed = true;
      score++;
      scoreEl.textContent = score;
      if (score > best) {
        best = score;
        bestEl.textContent = best;
        localStorage.setItem("floppyWilliamBest", best);
      }
    }
  }
  pipes = pipes.filter((p) => p.x > -80);

  // Presents
  for (const g of presents) {
    g.x -= PIPE_SPEED;
    g.bob += 0.1;
    if (!g.collected && Math.hypot(g.x - bird.x, g.y - bird.y) < g.r + bird.r * 0.7) {
      g.collected = true;
      score += 3;
      scoreEl.textContent = score;
      spawnConfetti();
    }
  }
  presents = presents.filter((g) => g.x > -40 && !g.collected);

  // Particles
  for (const pa of particles) {
    pa.x += pa.vx;
    pa.y += pa.vy;
    if (pa.gravity) pa.vy += pa.gravity;
    pa.life--;
  }
  particles = particles.filter((pa) => pa.life > 0);

  // Collisions
  if (bird.y + bird.r > H - 40 || bird.y - bird.r < 0) return die();
  for (const p of pipes) {
    if (bird.x + bird.r * 0.7 > p.x && bird.x - bird.r * 0.7 < p.x + 60) {
      if (bird.y - bird.r * 0.7 < p.gapY || bird.y + bird.r * 0.7 > p.gapY + PIPE_GAP) {
        return die();
      }
    }
  }
}

function die() {
  gameState = "dead";
  spawnConfetti();
  setTimeout(() => {
    showOverlay("🎂 Boom! 🎂", `You scored <b>${score}</b><br/>Best: <b>${best}</b><br/><br/>Press Start to try again`);
  }, 500);
}

// ---------- Draw ----------
function drawBackground() {
  if (bgImg.complete) {
    // tiled scrolling
    const w = (bgImg.width * H) / bgImg.height;
    const offset = ((bgX % w) + w) % w;
    ctx.drawImage(bgImg, -offset, 0, w, H);
    ctx.drawImage(bgImg, w - offset, 0, w, H);
  } else {
    ctx.fillStyle = "#87ceeb";
    ctx.fillRect(0, 0, W, H);
  }

  // semi-transparent party overlay
  ctx.fillStyle = "rgba(255, 200, 230, 0.15)";
  ctx.fillRect(0, 0, W, H);

  // floating balloons in background
  for (let i = 0; i < 4; i++) {
    const bx = ((i * 137 - frame * 0.4) % (W + 80) + W + 80) % (W + 80) - 40;
    const by = 80 + Math.sin((frame + i * 60) * 0.02) * 20 + i * 30;
    drawBalloon(bx, by, ["#ff4fa3", "#ffd84f", "#a0e7ff", "#c5a0ff"][i]);
  }
}

function drawBalloon(x, y, color) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, 14, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y + 18);
  ctx.lineTo(x - 3, y + 22);
  ctx.lineTo(x + 3, y + 22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 22);
  ctx.quadraticCurveTo(x + 6, y + 40, x, y + 60);
  ctx.stroke();
  ctx.restore();
}

function drawGround() {
  ctx.fillStyle = "#5e3a1f";
  ctx.fillRect(0, H - 40, W, 40);
  ctx.fillStyle = "#7a4d29";
  for (let x = 0; x < W; x += 20) {
    ctx.fillRect(x + ((-frame * 2) % 20), H - 40, 10, 6);
  }
  // grass
  ctx.fillStyle = "#7CFC00";
  ctx.fillRect(0, H - 44, W, 4);
}

function drawCake(x, y, w, h, flip = false) {
  ctx.save();
  // base layer
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(x, y, w, h);
  // frosting drips
  ctx.fillStyle = "#fff0f5";
  if (!flip) {
    // top frosting on bottom pipe (drips down)
    ctx.fillRect(x - 4, y, w + 8, 14);
    for (let i = 0; i < 5; i++) {
      const dx = x + (i + 0.5) * (w / 5);
      ctx.beginPath();
      ctx.arc(dx, y + 14, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // bottom frosting on top pipe
    ctx.fillRect(x - 4, y + h - 14, w + 8, 14);
    for (let i = 0; i < 5; i++) {
      const dx = x + (i + 0.5) * (w / 5);
      ctx.beginPath();
      ctx.arc(dx, y + h - 14, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // sprinkles
  const colors = ["#ff4fa3", "#ffd84f", "#a0e7ff", "#7CFC00", "#c5a0ff"];
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = colors[i % colors.length];
    const sx = x + 4 + ((i * 37) % (w - 8));
    const sy = y + 20 + ((i * 53) % (h - 30));
    ctx.fillRect(sx, sy, 3, 6);
  }

  // candle on top of bottom-pipe (the cap end facing the gap)
  if (!flip) {
    const cx = x + w / 2;
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - 3, y - 14, 6, 14);
    // flame
    ctx.fillStyle = "#ff8a00";
    ctx.beginPath();
    ctx.ellipse(cx, y - 18, 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe75e";
    ctx.beginPath();
    ctx.ellipse(cx, y - 17, 1.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPresent(g) {
  if (g.collected) return;
  ctx.save();
  ctx.translate(g.x, g.y + Math.sin(g.bob) * 4);
  ctx.fillStyle = "#ff4fa3";
  ctx.fillRect(-g.r, -g.r, g.r * 2, g.r * 2);
  ctx.fillStyle = "#ffd84f";
  ctx.fillRect(-g.r, -3, g.r * 2, 6);
  ctx.fillRect(-3, -g.r, 6, g.r * 2);
  // bow
  ctx.beginPath();
  ctx.ellipse(-5, -g.r - 2, 5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(5, -g.r - 2, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPipes() {
  for (const p of pipes) {
    drawCake(p.x, 0, 60, p.gapY, true); // top
    drawCake(p.x, p.gapY + PIPE_GAP, 60, H - (p.gapY + PIPE_GAP) - 40, false); // bottom
  }
}

function drawBird() {
  if (!birdImg) return;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.angle);
  const size = bird.r * 2.2;
  ctx.drawImage(birdImg, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawParticles() {
  for (const pa of particles) {
    ctx.globalAlpha = Math.max(0, pa.life / 60);
    ctx.fillStyle = pa.color;
    ctx.fillRect(pa.x, pa.y, pa.size, pa.size);
  }
  ctx.globalAlpha = 1;
}

function drawIdle() {
  drawBackground();
  drawGround();
  if (birdImg) {
    ctx.save();
    ctx.translate(bird.x, bird.y + Math.sin(Date.now() / 200) * 6);
    ctx.rotate(Math.sin(Date.now() / 300) * 0.2);
    const size = bird.r * 2.2;
    ctx.drawImage(birdImg, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

function draw() {
  drawBackground();
  drawPipes();
  for (const g of presents) drawPresent(g);
  drawParticles();
  drawBird();
  drawGround();
}

// ---------- Loop ----------
function loop() {
  if (gameState === "ready" && birdImg) {
    drawIdle();
  } else if (gameState === "playing" || gameState === "dead") {
    update();
    draw();
  }
  requestAnimationFrame(loop);
}
loop();
