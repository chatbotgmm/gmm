// 섬 전체에 쓰는 숫자들. three.js에 기대지 않음(테스트에서 그대로 불러 씀).
export const GRID_W = 96;          // 섬 격자 가로 칸 수(넓은 섬). 시험용 예전 섬은 64칸으로 따로 만듦
export const GRID_H = 96;          // 섬 격자 세로 칸 수
export const CELL = 1;             // 한 칸 = 1 m
export const CHUNK = 16;           // 바닥은 16×16 칸 묶음(청크)마다 메쉬 하나
export const SEA_LEVEL = -0.2;     // 높이가 이보다 낮은 칸은 바다
export const WATER_Y = -0.18;      // 물 표면 높이(그림용)
export const SEABED = -1.0;        // 먼 바다 바닥 높이
export const MAX_STEP = 0.25;      // 이웃 칸으로 걸어서 오르내릴 수 있는 최대 높이 차
export const UNIT_SPEED = 1.4;     // 갈매미 걷기 속도(칸/초)

// 격자 좌표(칸 단위, 칸 중심 = 정수 + 0.5) → 월드 좌표(m). 섬 중심이 월드 원점.
export const toWorldX = gx => (gx - GRID_W / 2) * CELL;
export const toWorldZ = gz => (gz - GRID_H / 2) * CELL;
export const toGridX = wx => wx / CELL + GRID_W / 2;
export const toGridZ = wz => wz / CELL + GRID_H / 2;
