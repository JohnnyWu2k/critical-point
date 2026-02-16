import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";
import './style.css';

// 1. Firebase 配置 (使用你的專案金鑰)
const firebaseConfig = {
  apiKey: "AIzaSyBpF9R9ZpS0eYVrCQ4axLGsGlX06KEASuY",
  authDomain: "critical-point-342e5.firebaseapp.com",
  databaseURL: "https://critical-point-342e5-default-rtdb.firebaseio.com",
  projectId: "critical-point-342e5",
  storageBucket: "critical-point-342e5.firebasestorage.app",
  messagingSenderId: "948941618561",
  appId: "1:948941618561:web:fde374cb375b50ec3a3c80"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 2. 遊戲常數與型別
const ROWS = 8;
const COLS = 8;
type Player = 'red' | 'green';

interface Cell {
  orbs: number;
  owner: Player | null;
}

interface GameState {
  grid: Cell[][];
  turn: Player;
  winner: string | null;
  redReady?: boolean;   // 紅方是否想重玩
  greenReady?: boolean; // 綠方是否想重玩
}

// 3. 基礎功能
function createEmptyGrid(): Cell[][] {
  return Array.from({ length: ROWS }, () => 
    Array.from({ length: COLS }, () => ({ orbs: 0, owner: null }))
  );
}

let gameState: GameState = {
  grid: createEmptyGrid(),
  turn: 'red',
  winner: null,
  redReady: false,
  greenReady: false
};

const myColor: Player = Math.random() > 0.5 ? 'red' : 'green';
const roomRef = ref(db, 'rooms/lobby');

function getCapacity(r: number, c: number): number {
  let neighbors = 0;
  if (r > 0) neighbors++;
  if (r < ROWS - 1) neighbors++;
  if (c > 0) neighbors++;
  if (c < COLS - 1) neighbors++;
  return neighbors;
}

// 4. 核心連鎖爆炸演算法
function handleMove(grid: Cell[][], r: number, c: number, player: Player) {
  grid[r][c].orbs++;
  grid[r][c].owner = player;

  const capacity = getCapacity(r, c);
  if (grid[r][c].orbs >= capacity) {
    grid[r][c].orbs -= capacity;
    if (grid[r][c].orbs === 0) grid[r][c].owner = null; 

    const neighbors = [
      { r: r - 1, c: c }, { r: r + 1, c: c },
      { r: r, c: c - 1 }, { r: r, c: c + 1 }
    ];

    for (const n of neighbors) {
      if (n.r >= 0 && n.r < ROWS && n.c >= 0 && n.c < COLS) {
        handleMove(grid, n.r, n.c, player);
      }
    }
  }
}

function checkWinner(grid: Cell[][]): string | null {
  let redCount = 0;
  let greenCount = 0;
  let totalOrbs = 0;
  grid.forEach(row => row.forEach(cell => {
    if (cell.owner === 'red') redCount++;
    if (cell.owner === 'green') greenCount++;
    totalOrbs += cell.orbs;
  }));
  if (totalOrbs > 1) {
    if (redCount === 0) return '綠隊獲勝';
    if (greenCount === 0) return '紅隊獲勝';
  }
  return null;
}

// 5. 連線與操作
onValue(roomRef, (snapshot) => {
  const data = snapshot.val();
  if (data) {
    gameState = data;
    render();
  } else {
    set(roomRef, gameState);
  }
});

function onCellClick(r: number, c: number) {
  if (gameState.winner || gameState.turn !== myColor) return;
  const cell = gameState.grid[r][c];
  if (cell.owner && cell.owner !== myColor) return;

  const newGrid = JSON.parse(JSON.stringify(gameState.grid));
  handleMove(newGrid, r, c, myColor);
  
  set(roomRef, {
    ...gameState,
    grid: newGrid,
    turn: gameState.turn === 'red' ? 'green' : 'red',
    winner: checkWinner(newGrid),
    // 每次下棋就自動取消重製請求
    redReady: false, 
    greenReady: false
  });
}

// 雙人重製邏輯
function requestRematch() {
  const isRed = myColor === 'red';
  const iAmReady = isRed ? gameState.redReady : gameState.greenReady;
  if (iAmReady) return; // 已經點過了

  const opponentReady = isRed ? gameState.greenReady : gameState.redReady;

  if (opponentReady) {
    // 雙方都同意，立刻洗牌
    set(roomRef, {
      grid: createEmptyGrid(),
      turn: 'red',
      winner: null,
      redReady: false,
      greenReady: false
    });
  } else {
    // 只有我同意
    const update = isRed ? { redReady: true } : { greenReady: true };
    set(roomRef, { ...gameState, ...update });
  }
}

// 6. UI 繪製
function render() {
  const gridEl = document.getElementById('grid')!;
  const myTeamEl = document.getElementById('my-team')!;
  const currentTurnEl = document.getElementById('current-turn')!;
  gridEl.innerHTML = ''; 

  // 更新頂部資訊
  if (gameState.winner) {
    myTeamEl.innerText = `遊戲結束`;
    currentTurnEl.innerText = `🎉 ${gameState.winner}`;
    currentTurnEl.className = 'status-item winner-glow';
  } else {
    myTeamEl.innerHTML = `我方: <span class="dot-inline ${myColor}"></span>`;
    currentTurnEl.innerHTML = `回合: <span class="dot-inline ${gameState.turn}"></span>`;
    currentTurnEl.className = `status-item turn-${gameState.turn}`;
  }

  // 繪製棋盤
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cellData = gameState.grid[r][c];
      const cellEl = document.createElement('div');
      cellEl.className = 'cell';
      if (cellData.orbs > 0 && cellData.orbs === getCapacity(r, c) - 1) cellEl.classList.add('critical');

      if (cellData.orbs > 0) {
        const orbContainer = document.createElement('div');
        orbContainer.className = 'orb-layout';
        for (let i = 0; i < cellData.orbs; i++) {
          const dot = document.createElement('div');
          dot.className = `dot ${cellData.owner}`;
          orbContainer.appendChild(dot);
        }
        cellEl.appendChild(orbContainer);
      }
      cellEl.onclick = () => onCellClick(r, c);
      gridEl.appendChild(cellEl);
    }
  }

  // 更新重製按鈕狀態
  let resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  if (!resetBtn) {
    resetBtn = document.createElement('button');
    resetBtn.id = 'reset-btn';
    document.body.appendChild(resetBtn);
  }

  const iAmReady = myColor === 'red' ? gameState.redReady : gameState.greenReady;
  const opponentReady = myColor === 'red' ? gameState.greenReady : gameState.redReady;

  if (iAmReady) {
    resetBtn.innerText = "等待對手同意...";
    resetBtn.disabled = true;
    resetBtn.className = 'ready';
  } else if (opponentReady) {
    resetBtn.innerText = "對手請求重玩，點擊同意";
    resetBtn.disabled = false;
    resetBtn.className = 'opponent-waiting';
  } else {
    resetBtn.innerText = "請求重新開始遊戲";
    resetBtn.disabled = false;
    resetBtn.className = '';
  }
  resetBtn.onclick = requestRematch;
}