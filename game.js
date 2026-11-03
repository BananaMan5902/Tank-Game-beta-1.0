
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let W, H;
function resize() {
  W = canvas.width = window.innerWidth * devicePixelRatio;
  H = canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  W = window.innerWidth;
  H = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

const WORLD = { w: 2600, h: 2000 };
const keys = {};
const mouse = { x: W / 2, y: H / 2, down: false };

let money = 0;
let kills = 0;
let wave = 1;
let gameOver = false;
let lastTime = 0;
let spawnTimer = 0;
let messageTimer = 0;

const player = {
  x: WORLD.w / 2,
  y: WORLD.h / 2,
  angle: 0,
  turret: 0,
  speed: 145,
  health: 100,
  maxHealth: 100,
  damage: 25,
  armor: 1,
  fireRate: 0.32,
  fireTimer: 0,
  radius: 25
};

let camera = { x: 0, y: 0 };
let bullets = [];
let enemies = [];
let obstacles = [];
let particles = [];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function say(text) {
  document.getElementById("message").textContent = text;
  messageTimer = 3;
}

function makeObstacle(x, y, type) {
  return {
    x, y, type,
    size: type === "house" ? 55 : type === "rock" ? 23 : 27,
    health: type === "house" ? 100 : type === "rock" ? Infinity : Infinity
  };
}

// Generate battlefield
for (let i = 0; i < 160; i++) {
  const x = rand(80, WORLD.w - 80);
  const y = rand(80, WORLD.h - 80);

  if (Math.hypot(x - player.x, y - player.y) < 220) continue;

  const r = Math.random();
  makeObstacle(
    x, y,
    r < 0.55 ? "tree" : r < 0.82 ? "house" : "rock"
  );
  obstacles.push(makeObstacle(
    x, y,
    r < 0.55 ? "tree" : r < 0.82 ? "house" : "rock"
  ));
}

// Keyboard
window.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

canvas.addEventListener("mousedown", () => mouse.down = true);
window.addEventListener("mouseup", () => mouse.down = false);
canvas.addEventListener("contextmenu", e => e.preventDefault());

function collides(x, y, radius) {
  if (x < radius || y < radius ||
      x > WORLD.w - radius || y > WORLD.h - radius) return true;

  return obstacles.some(o =>
    Math.hypot(x - o.x, y - o.y) < radius + o.size * 0.7
  );
}

function moveTank(tank, dx, dy) {
  if (!collides(tank.x + dx, tank.y, tank.radius || 22))
    tank.x += dx;

  if (!collides(tank.x, tank.y + dy, tank.radius || 22))
    tank.y += dy;
}

function fire(tank, angle, isPlayer) {
  const speed = isPlayer ? 620 : 390;

  bullets.push({
    x: tank.x + Math.cos(angle) * 32,
    y: tank.y + Math.sin(angle) * 32,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage: isPlayer ? player.damage : 9 + wave * 1.2,
    owner: isPlayer ? "player" : "enemy",
    life: 2.2
  });
}

function spawnEnemy() {
  let angle = rand(0, Math.PI * 2);
  let x, y;

  for (let i = 0; i < 30; i++) {
    x = player.x + Math.cos(angle) * rand(420, 650);
    y = player.y + Math.sin(angle) * rand(420, 650);

    if (x > 40 && y > 40 &&
        x < WORLD.w - 40 && y < WORLD.h - 40 &&
        !collides(x, y, 25)) break;

    angle = rand(0, Math.PI * 2);
  }

  if (collides(x, y, 25)) return;

  const heavy = Math.random() < Math.min(0.15 + wave * 0.025, 0.55);

  enemies.push({
    x, y,
    angle: 0,
    turret: 0,
    radius: heavy ? 29 : 22,
    health: heavy ? 100 + wave * 12 : 45 + wave * 6,
    maxHealth: heavy ? 100 + wave * 12 : 45 + wave * 6,
    speed: heavy ? 65 : 90 + Math.min(wave * 2, 35),
    fireTimer: rand(0.5, 2),
    fireRate: heavy ? 1.8 : 1.35,
    heavy,
    dead: false
  });
}

function explosion(x, y, color, amount = 12) {
  for (let i = 0; i < amount; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 180);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.25, 0.7),
      color,
      size: rand(2, 6)
    });
  }
}

function update(dt) {
  if (gameOver) return;

  // Player movement
  let dx = 0, dy = 0;
  if (keys.w || keys.arrowup) dy--;
  if (keys.s || keys.arrowdown) dy++;
  if (keys.a || keys.arrowleft) dx--;
  if (keys.d || keys.arrowright) dx++;

  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;

    player.angle = Math.atan2(dy, dx);
    moveTank(player, dx * player.speed * dt, dy * player.speed * dt);
  }

  const worldMouseX = mouse.x + camera.x;
  const worldMouseY = mouse.y + camera.y;
  player.turret = Math.atan2(
    worldMouseY - player.y,
    worldMouseX - player.x
  );

  player.fireTimer -= dt;
  if (mouse.down && player.fireTimer <= 0) {
    fire(player, player.turret, true);
    player.fireTimer = player.fireRate;
  }

  // Enemy AI
  enemies.forEach(enemy => {
    if (enemy.dead) return;

    const dist = distance(player, enemy);
    const angle = Math.atan2(
      player.y - enemy.y,
      player.x - enemy.x
    );

    enemy.turret = angle;
    enemy.angle = angle;

    if (dist > 155) {
      moveTank(
        enemy,
        Math.cos(angle) * enemy.speed * dt,
        Math.sin(angle) * enemy.speed * dt
      );
    }

    enemy.fireTimer -= dt;

    if (dist < 570 && enemy.fireTimer <= 0) {
      fire(enemy, angle, false);
      enemy.fireTimer = enemy.fireRate + rand(0, 0.5);
    }
  });

  // Bullets
  bullets.forEach(b => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.x < 0 || b.y < 0 ||
        b.x > WORLD.w || b.y > WORLD.h) {
      b.life = 0;
    }

    obstacles.forEach(o => {
      if (b.life <= 0) return;

      if (Math.hypot(b.x - o.x, b.y - o.y) < o.size) {
        if (o.type === "house" && b.owner === "player") {
          o.health -= b.damage;
          if (o.health <= 0) {
            explosion(o.x, o.y, "#b77c42", 25);
            o.type = "rubble";
            o.size = 24;
            o.health = Infinity;
            money += 10;
          }
        }
        b.life = 0;
      }
    });

    if (b.life <= 0) return;

    if (b.owner === "player") {
      enemies.forEach(e => {
        if (!e.dead && Math.hypot(b.x - e.x, b.y - e.y) < e.radius + 5) {
          e.health -= b.damage;
          b.life = 0;

          if (e.health <= 0) {
            e.dead = true;
            kills++;
            money += e.heavy ? 65 : 35;
            explosion(e.x, e.y, "#e68b38", 24);
            say("Enemy destroyed! +$" + (e.heavy ? 65 : 35));
          }
        }
      });
    } else {
      if (Math.hypot(b.x - player.x, b.y - player.y) < player.radius + 5) {
        player.health -= b.damage / player.armor;
        b.life = 0;
        explosion(b.x, b.y, "#f1c75b", 5);

        if (player.health <= 0) {
          player.health = 0;
          gameOver = true;
          document.getElementById("finalWave").textContent = wave;
          document.getElementById("gameover").classList.remove("hidden");
        }
      }
    }
  });

  bullets = bullets.filter(b => b.life > 0);
  enemies = enemies.filter(e => !e.dead);

  // Particles
  particles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  particles = particles.filter(p => p.life > 0);

  // Waves
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    if (enemies.length < Math.min(3 + wave * 2, 20)) {
      spawnEnemy();
    }
    spawnTimer = Math.max(0.65, 2.5 - wave * 0.08);
  }

  if (kills >= wave * 5) {
    wave++;
    say("WAVE " + wave + " INCOMING!");
  }

  // Camera
  camera.x = Math.max(0, Math.min(
    WORLD.w - W,
    player.x - W / 2
  ));
  camera.y = Math.max(0, Math.min(
    WORLD.h - H,
    player.y - H / 2
  ));

  if (messageTimer > 0) messageTimer -= dt;

  // HUD
  document.getElementById("health").textContent =
    Math.ceil(player.health);
  document.getElementById("money").textContent = money;
  document.getElementById("wave").textContent = wave;
  document.getElementById("kills").textContent = kills;
  document.getElementById("healthFill").style.width =
    (player.health / player.maxHealth * 100) + "%";
}

function drawTank(t, color, enemy = false) {
  ctx.save();
  ctx.translate(t.x, t.y);

  // Tracks
  ctx.fillStyle = "#20251d";
  ctx.fillRect(-26, -21, 52, 9);
  ctx.fillRect(-26, 12, 52, 9);

  // Wheels
  ctx.fillStyle = "#65675b";
  for (let i = -20; i <= 20; i += 10) {
    ctx.beginPath();
    ctx.arc(i, -16, 4, 0, Math.PI * 2);
    ctx.arc(i, 16, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(-22, -13, 44, 26);

  // Turret
  ctx.rotate(t.turret || 0);
  ctx.fillStyle = enemy ? "#a35b42" : "#87976a";
  ctx.fillRect(-8, -9, 26, 18);

  // Cannon
  ctx.fillStyle = "#252921";
  ctx.fillRect(5, -4, 34, 8);

  ctx.fillStyle = enemy ? "#c77a58" : "#b4c58c";
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  if (enemy) {
    const barWidth = 38;
    ctx.fillStyle = "#391d1d";
    ctx.fillRect(t.x - barWidth / 2, t.y - 38, barWidth, 5);
    ctx.fillStyle = "#d14c40";
    ctx.fillRect(
      t.x - barWidth / 2,
      t.y - 38,
      barWidth * Math.max(0, t.health / t.maxHealth),
      5
    );
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Ground
  ctx.fillStyle = "#596548";
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  // Ground texture
  ctx.fillStyle = "rgba(30,45,25,0.12)";
  for (let x = 0; x < WORLD.w; x += 80) {
    for (let y = 0; y < WORLD.h; y += 80) {
      ctx.fillRect(x + 15, y + 20, 3, 3);
    }
  }

  // Roads
  ctx.fillStyle = "#777367";
  ctx.fillRect(0, 950, WORLD.w, 85);
  ctx.fillRect(1250, 0, 85, WORLD.h);

  ctx.strokeStyle = "#c0b69a";
  ctx.setLineDash([30, 25]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 992);
  ctx.lineTo(WORLD.w, 992);
  ctx.moveTo(1292, 0);
  ctx.lineTo(1292, WORLD.h);
  ctx.stroke();
  ctx.setLineDash([]);

  // World border
  ctx.strokeStyle = "#263324";
  ctx.lineWidth = 15;
  ctx.strokeRect(0, 0, WORLD.w, WORLD.h);

  // Obstacles
  obstacles.forEach(o => {
    ctx.save();
    ctx.translate(o.x, o.y);

    if (o.type === "tree") {
      ctx.fillStyle = "#51412d";
      ctx.fillRect(-5, -4, 10, 23);

      ctx.fillStyle = "#294d29";
      ctx.beginPath();
      ctx.arc(0, -8, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#3d6835";
      ctx.beginPath();
      ctx.arc(-8, -15, 13, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.type === "house") {
      ctx.fillStyle = "#75634b";
      ctx.fillRect(-27, -23, 54, 46);
      ctx.fillStyle = "#493a30";
      ctx.beginPath();
      ctx.moveTo(-33, -23);
      ctx.lineTo(0, -42);
      ctx.lineTo(33, -23);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#302e28";
      ctx.fillRect(-7, -5, 14, 28);
      ctx.fillStyle = "#c7a55f";
      ctx.fillRect(-22, -14, 10, 10);
      ctx.fillRect(12, -14, 10, 10);
    } else if (o.type === "rock") {
      ctx.fillStyle = "#777b70";
      ctx.beginPath();
      ctx.arc(0, 0, o.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#504d43";
      ctx.fillRect(-24, -18, 48, 36);
    }

    ctx.restore();
  });

  // Bullets
  bullets.forEach(b => {
    ctx.fillStyle = b.owner === "player" ? "#ffe49a" : "#f18c53";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Explosions
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Enemies
  enemies.forEach(e => {
    drawTank(e, e.heavy ? "#79513e" : "#a35b42", true);
  });

  // Player
  drawTank(player, "#82966b");

  ctx.restore();
}

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.04);
  lastTime = time;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

function buy(cost, action, success) {
  if (money < cost) {
    say("Not enough money!");
    return;
  }
  money -= cost;
  action();
  say(success);
}

document.getElementById("repair").onclick = () => {
  if (player.health >= player.maxHealth) {
    say("Already fully repaired!");
    return;
  }
  buy(50, () => {
    player.health = Math.min(player.maxHealth, player.health + 40);
  }, "Tank repaired!");
};

document.getElementById("damage").onclick = () => {
  buy(100, () => {
    player.damage += 8;
  }, "Weapon damage upgraded!");
};

document.getElementById("speed").onclick = () => {
  buy(150, () => {
    player.speed += 18;
  }, "Engine upgraded!");
};

document.getElementById("armor").onclick = () => {
  buy(200, () => {
    player.armor += 0.25;
    player.maxHealth += 15;
    player.health += 15;
  }, "Armor upgraded!");
};

requestAnimationFrame(loop);
