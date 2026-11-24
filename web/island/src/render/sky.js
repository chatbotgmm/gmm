// 하늘: 위는 파랗고 수평선 쪽은 밝은 그라데이션 배경 + 섬 바깥 하늘에 천천히 흘러가는 뭉게구름(캔버스로 그린 그림 판).
import * as THREE from "three";

/** 세로 그라데이션 배경(화면에 꽉 차게) */
export function skyBackground(top = "#7fc4ec", horizon = "#e4f3f6") {
  const c = document.createElement("canvas"); c.width = 2; c.height = 256;
  const g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top); grad.addColorStop(0.75, horizon); grad.addColorStop(1, horizon);
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 뭉게구름 한 장의 그림(둥근 덩이 여러 개, 아래쪽은 살짝 그늘) */
function cloudTexture(seed) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; const g = c.getContext("2d");
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9; i++) {
    const x = 40 + r() * 176, y = 52 + r() * 34, rad = 22 + r() * 30;
    const grad = g.createRadialGradient(x, y - rad * 0.3, rad * 0.1, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.95)"); grad.addColorStop(0.6, "rgba(255,250,244,0.85)"); grad.addColorStop(1, "rgba(255,245,235,0)");
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const shade = g.createLinearGradient(0, 70, 0, 128); shade.addColorStop(0, "rgba(255,255,255,0)"); shade.addColorStop(1, "rgba(214,200,196,0.35)");
  g.globalCompositeOperation = "source-atop"; g.fillStyle = shade; g.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** 섬 둘레 하늘(반지름 inner~outer m, 높이 22~34 m)에 구름 n개. tick(dt)로 천천히 흐름. */
export function createClouds(n = 12, inner = 58, outer = 95) {
  const group = new THREE.Group(), clouds = [];
  const texes = [1, 7, 13, 29].map(cloudTexture);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + Math.sin(i * 7.1) * 0.3, rr = inner + (outer - inner) * (0.5 + 0.5 * Math.sin(i * 3.7));
    const m = new THREE.SpriteMaterial({ map: texes[i % texes.length], transparent: true, depthWrite: false, fog: false, opacity: 0.95 });
    const sp = new THREE.Sprite(m), w = 22 + 14 * (0.5 + 0.5 * Math.sin(i * 5.3));
    sp.scale.set(w, w * 0.5, 1); sp.position.set(Math.cos(a) * rr, 22 + 12 * (0.5 + 0.5 * Math.sin(i * 2.9)), Math.sin(a) * rr);
    group.add(sp); clouds.push({ sp, a, rr, speed: 0.004 + 0.003 * (i % 3) });
  }
  group.userData.tick = dt => { for (const c of clouds) { c.a += c.speed * dt; c.sp.position.x = Math.cos(c.a) * c.rr; c.sp.position.z = Math.sin(c.a) * c.rr; } };
  return group;
}
