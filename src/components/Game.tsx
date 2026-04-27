import React, { useEffect, useRef, useState, useCallback } from 'react';

// === GAME CONSTANTS ===
const LOGICAL_WIDTH = 120;
const LOGICAL_HEIGHT = 200;
const PLAYER_SIZE = 12;
const ITEM_SIZE = 10;
const BASE_FALL_SPEED = 60; // px per sec
const BASE_SPAWN_RATE = 800; // ms

// Types
type EntityType = 'doc' | 'pot' | 'call' | 'coffee';

interface Entity {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: EntityType;
  speed: number;
}

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  speedModifier: number;
  speedTimer: number;
}

interface GameState {
  status: 'IDLE' | 'PLAYING' | 'GAMEOVER';
  score: number;
  timeRunning: number;
}

// === ASSETS ===
const EMOJI_MAP: Record<EntityType, string> = {
  doc: '📁',
  pot: '🥘',
  call: '📱',
  coffee: '☕',
};
const PLAYER_EMOJI = '🏃';

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  const [gameState, setGameState] = useState<GameState>({
    status: 'IDLE',
    score: 0,
    timeRunning: 0,
  });
  const [highScore, setHighScore] = useState(0);

  // Mutable Game State for game loop to avoid dependency issues
  const stateRef = useRef({
    player: {
      x: LOGICAL_WIDTH / 2 - PLAYER_SIZE / 2,
      y: LOGICAL_HEIGHT - PLAYER_SIZE - 10,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      speedModifier: 1,
      speedTimer: 0,
    } as Player,
    entities: [] as Entity[],
    nextSpawnTime: 0,
    timeRunning: 0,
    score: 0,
    status: 'IDLE' as 'IDLE' | 'PLAYING' | 'GAMEOVER',
    keys: { left: false, right: false },
    entityIdCounter: 0,
  });

  useEffect(() => {
    const saved = localStorage.getItem('workerGameHighScore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  const saveHighScore = (score: number) => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('workerGameHighScore', score.toString());
    }
  };

  const startGame = () => {
    stateRef.current = {
      player: {
        x: LOGICAL_WIDTH / 2 - PLAYER_SIZE / 2,
        y: LOGICAL_HEIGHT - PLAYER_SIZE - 10,
        width: PLAYER_SIZE,
        height: PLAYER_SIZE,
        speedModifier: 1,
        speedTimer: 0,
      },
      entities: [],
      nextSpawnTime: 0,
      timeRunning: 0,
      score: 0,
      status: 'PLAYING',
      keys: stateRef.current.keys, // preserve keys
      entityIdCounter: 0,
    };
    setGameState({ status: 'PLAYING', score: 0, timeRunning: 0 });
    lastTimeRef.current = performance.now();
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const checkCollision = (rect1: {x: number, y: number, width: number, height: number}, rect2: {x: number, y: number, width: number, height: number}) => {
    const margin = 2; // slight forgiveness
    return (
      rect1.x + margin < rect2.x + rect2.width - margin &&
      rect1.x + rect1.width - margin > rect2.x + margin &&
      rect1.y + margin < rect2.y + rect2.height - margin &&
      rect1.y + rect1.height - margin > rect2.y + margin
    );
  };

  const spawnEntity = (dt: number) => {
    const state = stateRef.current;
    if (state.timeRunning > state.nextSpawnTime) {
      // Determine what to spawn
      const rand = Math.random();
      let type: EntityType = 'doc';
      if (rand < 0.1) type = 'coffee'; // 10% chance
      else if (rand < 0.4) type = 'pot'; // 30% chance for game-ending pot
      else if (rand < 0.6) type = 'call'; // 20% chance
      else type = 'doc'; // 40% chance

      // Difficulty ramps up over time
      const speedMultiplier = 1 + state.timeRunning / 30000; // +1 every 30s
      
      const newEntity: Entity = {
        id: state.entityIdCounter++,
        x: Math.random() * (LOGICAL_WIDTH - ITEM_SIZE),
        y: -ITEM_SIZE,
        width: ITEM_SIZE,
        height: ITEM_SIZE,
        type,
        speed: (BASE_FALL_SPEED * speedMultiplier) * (0.8 + Math.random() * 0.4), // slight random variance
      };
      
      state.entities.push(newEntity);

      // Next spawn logic
      const spawnRateMultiplier = Math.max(0.3, 1 - state.timeRunning / 60000); // gets faster down to 30%
      state.nextSpawnTime = state.timeRunning + (BASE_SPAWN_RATE * spawnRateMultiplier) * (0.8 + Math.random() * 0.4);
    }
  };

  const gameLoop = useCallback((time: number) => {
    if (stateRef.current.status !== 'PLAYING') return;

    let dt = (time - lastTimeRef.current) / 1000; // seconds
    lastTimeRef.current = time;
    if (dt > 0.1) dt = 0.1; // Cap dt at 100ms
    const state = stateRef.current;

    state.timeRunning += dt * 1000;
    
    // Default score: 10 points per second survived
    state.score += 10 * dt;

    // Player movement
    const basePlayerSpeed = 120;
    const currentSpeed = basePlayerSpeed * state.player.speedModifier;
    if (state.keys.left) {
      state.player.x -= currentSpeed * dt;
    }
    if (state.keys.right) {
      state.player.x += currentSpeed * dt;
    }

    // Clamp player to screen
    if (state.player.x < 0) state.player.x = 0;
    if (state.player.x > LOGICAL_WIDTH - state.player.width) state.player.x = LOGICAL_WIDTH - state.player.width;

    // Powerup timer
    if (state.player.speedTimer > 0) {
      state.player.speedTimer -= dt;
      if (state.player.speedTimer <= 0) {
        state.player.speedModifier = 1;
      }
    }

    // Spawn entities
    spawnEntity(dt);

    // Update entities and check collisions
    let collisionWithPot = false;
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const entity = state.entities[i];
      entity.y += entity.speed * dt;

      // Check out of bounds
      if (entity.y > LOGICAL_HEIGHT) {
        state.entities.splice(i, 1);
        continue;
      }

      // Check collision
      if (checkCollision(state.player, entity)) {
        if (entity.type === 'coffee') {
          // Speed up for 3 seconds
          state.player.speedModifier = 1.8;
          state.player.speedTimer = 3;
          state.score += 50; // Bonus points
          state.entities.splice(i, 1);
        } else if (entity.type === 'pot') {
          collisionWithPot = true;
          break;
        } else {
          // 'doc' or 'call'
          // Standard dodging game usually makes any hit a game over
          // Let's make "pot" the only instant game over as requested? 
          // Prompt: "被“黑锅”砸中则游戏结束" (hit by pot ends game).
          // But I'll make docs and calls also end game to keep it classic and challenging.
          // Wait, if docs/calls do not end game, what do they do? Maybe reduce score.
          state.score = Math.max(0, state.score - 50);
          state.player.speedModifier = 0.5; // slow down temporarily
          state.player.speedTimer = 1; // 1 second stun
          state.entities.splice(i, 1);
        }
      }
    }

    if (collisionWithPot) {
      state.status = 'GAMEOVER';
      setGameState({ status: 'GAMEOVER', score: Math.floor(state.score), timeRunning: state.timeRunning });
      saveHighScore(Math.floor(state.score));
      return; // Stop loop
    }

    // Render
    render(state);

    // 100ms throttle for react state updates so UI doesn't lag
    if (Math.floor(state.timeRunning / 200) > Math.floor((state.timeRunning - dt * 1000) / 200)) {
      setGameState({ status: 'PLAYING', score: Math.floor(state.score), timeRunning: state.timeRunning });
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  }, []);

  const render = (state: typeof stateRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // Draw simple grid to make it look a bit office-like or classic
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < LOGICAL_WIDTH; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, LOGICAL_HEIGHT); ctx.stroke();
    }
    for (let i = 0; i < LOGICAL_HEIGHT; i += 20) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(LOGICAL_WIDTH, i); ctx.stroke();
    }

    // Set font for emojis
    ctx.textBaseline = 'top';

    // Draw entities
    state.entities.forEach(entity => {
      ctx.font = `${entity.height}px Arial`;
      ctx.fillText(EMOJI_MAP[entity.type], entity.x, entity.y);
    });

    // Draw player
    ctx.font = `${state.player.height}px Arial`;
    // If player has speed buff or debuff, change drawing slightly
    if (state.player.speedModifier > 1) {
      // speed trail effect (fake)
      ctx.globalAlpha = 0.5;
      ctx.fillText(PLAYER_EMOJI, state.player.x, state.player.y + 4);
      ctx.globalAlpha = 1.0;
    }
    ctx.fillText(PLAYER_EMOJI, state.player.x, state.player.y);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') stateRef.current.keys.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') stateRef.current.keys.right = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') stateRef.current.keys.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') stateRef.current.keys.right = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Pointer controls (Touch / Mouse on screen)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) {
      stateRef.current.keys.left = true;
      stateRef.current.keys.right = false;
    } else {
      stateRef.current.keys.right = true;
      stateRef.current.keys.left = false;
    }
  };

  const handlePointerUp = () => {
    stateRef.current.keys.left = false;
    stateRef.current.keys.right = false;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-white font-mono select-none overflow-hidden touch-none w-full px-4 relative">
      <div 
        className="absolute inset-0 z-0 opacity-20 pointer-events-none" 
        style={{
          backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px), linear-gradient(rgba(0,0,0,.8) 30%, transparent)',
          backgroundSize: '40px 40px, 40px 40px, 100% 100%',
          backgroundColor: '#111'
        }}
      />
      <div className="z-10 mb-2 text-center flex-shrink-0">
        <h1 className="text-2xl font-bold text-yellow-400 mb-1 drop-shadow-md">打工人生存战</h1>
        <div className="flex items-center justify-center gap-4 text-sm text-neutral-300 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
          <span>得分: {gameState.score}</span>
          <span>最高分: {highScore}</span>
        </div>
      </div>

      <div 
        className="relative z-10 w-full max-w-[360px] aspect-[120/200] max-h-[70vh] flex-shrink-0 cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* The logical canvas mapped to a larger physical size for pixel art feel */}
        <canvas
          ref={canvasRef}
          width={LOGICAL_WIDTH}
          height={LOGICAL_HEIGHT}
          className="w-full h-full bg-white/90 border-4 border-neutral-700/80 rounded-md shadow-2xl block backdrop-blur-sm"
          style={{
            imageRendering: 'pixelated',
          }}
        />

        {gameState.status === 'IDLE' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 text-center rounded-md pointer-events-none">
            <h2 className="text-xl font-bold mb-4">准备上班？</h2>
            <p className="text-sm text-yellow-300 mb-2">👇 点击屏幕左/右侧移动</p>
            <p className="text-xs text-neutral-300 mb-2">💻 电脑可用方向键 ⬅️ ➡️</p>
            <p className="text-xs text-neutral-300 mb-2 mt-4 flex items-center justify-center flex-wrap gap-2">
               <span>☕ 加速</span> 
               <span>🥘 触发辞退(Game Over)</span> 
               <span>📁/📱 扣分减速</span>
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); startGame(); }}
              className="mt-6 px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded pointer-events-auto active:scale-95 transition-transform"
            >
              开始打工
            </button>
          </div>
        )}

        {gameState.status === 'GAMEOVER' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center rounded-md pointer-events-none">
            <h2 className="text-2xl font-bold text-red-500 mb-2">背锅了！</h2>
            <p className="mb-4 text-neutral-200">最终得分: {gameState.score}</p>
            <button
              onClick={(e) => { e.stopPropagation(); startGame(); }}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded mb-4 pointer-events-auto active:scale-95 transition-transform"
            >
              重新开始
            </button>
            <p className="text-xs text-neutral-400">老板说：年轻人要多历练。</p>
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-neutral-500 text-center flex-shrink-0 px-2">
        手机端：长按屏幕左/右半边可移动。 <br className="md:hidden" />
        电脑端：使用左右方向键或A/D键。
      </div>
    </div>
  );
}
