import { useState, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas';
import { useGameLoop } from './hooks/useGameLoop';
import type { FactionType, Position, BuildingType, MapType, VictoryMode } from './game/types';
import { FACTION_TEMPLATES, UNIT_NAMES, BUILDING_NAMES, UNIT_STATS, BUILDING_STATS, MAP_CONFIGS, FACTION_COLORS } from './game/constants';
import type { FactionConfig } from './utils/gameStateUtils';
import './App.css';

function useMusic(enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio('/music/bgm.mp3');
      audioRef.current.loop = true;
    }

    if (enabled) {
      playPromiseRef.current = audioRef.current.play();
      playPromiseRef.current.catch(e => {
          if (e.name !== 'AbortError') console.warn('BGM play failed:', e);
      });
    } else {
      if (playPromiseRef.current) {
          playPromiseRef.current.then(() => {
              if (audioRef.current) audioRef.current.pause();
          }).catch(() => {});
      } else {
          audioRef.current.pause();
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [enabled]);
}

function PauseMenu({ 
  onContinue, onToggleMusic, onToggleSound, onQuit, 
  musicOn, soundOn, playSound
}: { 
  onContinue: () => void, 
  onToggleMusic: () => void, 
  onToggleSound: () => void, 
  onQuit: () => void,
  musicOn: boolean,
  soundOn: boolean,
  playSound: (name: 'hit' | 'explode' | 'hurt' | 'click') => void
}) {
  return (
    <div className="pause-overlay">
      <div className="pause-modal">
        <h2>游戏暂停</h2>
        <div className="pause-buttons">
          <button onClick={() => { onContinue(); playSound('click'); }}>继续游戏</button>
          <button onClick={() => { onToggleMusic(); playSound('click'); }}>音乐: {musicOn ? '开启' : '关闭'}</button>
          <button onClick={() => { onToggleSound(); playSound('click'); }}>音效: {soundOn ? '开启' : '关闭'}</button>
          <button className="quit-button" onClick={() => { onQuit(); playSound('click'); }}>退出到主菜单</button>
        </div>
      </div>
    </div>
  );
}

function MapPreview({ type }: { type: MapType }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const config = MAP_CONFIGS.find(m => m.id === type);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = config?.previewColor || '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // Draw some abstract map features based on type
    ctx.fillStyle = config?.previewColor + '44';
    if (type === 'mountain_pass') {
      ctx.fillRect(0, canvas.height/2 - 10, canvas.width, 20);
    } else if (type === 'fortress') {
      ctx.beginPath(); ctx.arc(canvas.width/2, canvas.height/2, 40, 0, Math.PI*2); ctx.fill();
    } else if (type === 'labyrinth') {
      for(let i=0; i<5; i++) ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 30, 30);
    } else {
      ctx.fillRect(20, 20, canvas.width-40, canvas.height-40);
    }

    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(config?.name || '', canvas.width/2, canvas.height - 30);
  }, [type, config]);

  return (
    <div className="map-preview-container">
      <canvas ref={canvasRef} width={200} height={200} className="map-preview-canvas" />
      <p className="map-description">{config?.description}</p>
    </div>
  );
}

function FactionIntro() {
  const [selected, setSelected] = useState<FactionType>('human');
  const template = FACTION_TEMPLATES[selected];

  return (
    <div className="faction-intro">
      <div className="faction-tabs">
        {(Object.keys(FACTION_TEMPLATES) as FactionType[]).map(t => (
          <button 
            key={t} 
            className={selected === t ? 'active' : ''} 
            onClick={() => setSelected(t)}
          >
            {FACTION_TEMPLATES[t].name}
          </button>
        ))}
      </div>
      <div className="faction-details">
        <h3>{template.name}</h3>
        <p className="description">{template.description}</p>
        <ul className="traits-list">
          <li>🚀 速度: x{template.traits.speedMultiplier}</li>
          <li>❤️ 生命: x{template.traits.hpMultiplier}</li>
          <li>⚔️ 伤害: x{template.traits.damageMultiplier}</li>
          <li>💰 成本: x{template.traits.costMultiplier}</li>
        </ul>
      </div>
    </div>
  );
}

function VictoryModeInfo({ mode, active, onSelect }: { mode: VictoryMode, active: boolean, onSelect: () => void }) {
  return (
    <div className={`victory-mode-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="card-header">
        <input type="radio" checked={active} readOnly />
        <span>{mode === 'standard' ? '标准模式 (指挥中心)' : '血战到底 (彻底消灭)'}</span>
      </div>
      {active && (
        <p className="mode-detail">
          {mode === 'standard' 
            ? '摧毁敌方所有的指挥中心即可获胜。这是最经典的 RTS 胜利方式。' 
            : '必须消灭敌方所有单位、建筑，且对方无资源重建任何生产设施时才算获胜。'}
        </p>
      )}
    </div>
  );
}

function GameSession({ configs, speed, mapType, victoryMode, onQuit }: { configs: FactionConfig[], speed: number, mapType: MapType, victoryMode: VictoryMode, onQuit: () => void }) {
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [placingBuilding, setPlacingBuilding] = useState<BuildingType | null>(null);
  const { 
    gameState, moveUnits, moveCamera, updateZoom, trainUnit, 
    placeBuilding, setPaused, toggleSetting, playSound 
  } = useGameLoop(configs, speed, mapType, victoryMode);

  useMusic(gameState.settings.musicOn && !gameState.isPaused);

  const selectedBuilding = gameState.buildings.find(b => selectedUnitIds.includes(b.id));
  const playerFaction = gameState.factions[gameState.playerFaction];

  const handlePlaceBuilding = (type: BuildingType, pos: Position) => {
    placeBuilding(gameState.playerFaction, type, pos);
    setPlacingBuilding(null);
    playSound('click');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (placingBuilding) setPlacingBuilding(null);
        else setPaused(!gameState.isPaused);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [placingBuilding, gameState.isPaused, setPaused]);

  return (
    <div className="game-container">
      <GameCanvas 
        gameState={gameState} 
        selectedUnitIds={selectedUnitIds}
        onSelect={setSelectedUnitIds}
        onMove={(target: Position, targetEntityId?: string) => {
          if (selectedUnitIds.length > 0) {
            moveUnits(selectedUnitIds, target, targetEntityId);
          }
        }}
        onCameraMove={moveCamera}
        onZoom={updateZoom}
        placingBuilding={placingBuilding}
        onPlaceBuilding={handlePlaceBuilding}
      />
      
      {gameState.isPaused && !gameState.isGameOver && (
        <PauseMenu 
          onContinue={() => setPaused(false)}
          onToggleMusic={() => toggleSetting('musicOn')}
          onToggleSound={() => toggleSetting('soundOn')}
          onQuit={onQuit}
          musicOn={gameState.settings.musicOn}
          soundOn={gameState.settings.soundOn}
          playSound={playSound}
        />
      )}

      {gameState.isGameOver && (
          <div className="pause-overlay">
              <div className="pause-modal">
                  <h2>游戏结束</h2>
                  <h3>{gameState.winner === gameState.playerFaction ? '🏆 你胜利了！' : '💀 你失败了...'}</h3>
                  <p>获胜方: {gameState.winner ? gameState.factions[gameState.winner].name : '无'}</p>
                  <button onClick={onQuit}>返回主菜单</button>
              </div>
          </div>
      )}

      <div className="hud-top">
        <div className="resources">
          <div className="res-item gold">💰 金币: {Math.floor(gameState.factionResources[gameState.playerFaction].gold)}</div>
          <div className="res-item minerals">💎 矿产: {Math.floor(gameState.factionResources[gameState.playerFaction].minerals)}</div>
        </div>
        <div className="faction-header" style={{ color: playerFaction.unitColor }}>
          {playerFaction.name}
        </div>
      </div>

      {/* Selected Entity Info */}
      <div className="selection-info">
        {selectedBuilding ? (
          <div className="entity-card">
            <h4>{BUILDING_NAMES[selectedBuilding.type]}</h4>
            <div className="hp-bar-container">
              <div className="hp-bar" style={{ width: `${(selectedBuilding.hp / selectedBuilding.maxHp) * 100}%` }}></div>
            </div>
            <p>生命值: {Math.floor(selectedBuilding.hp)} / {Math.floor(selectedBuilding.maxHp)}</p>
            {selectedBuilding.isConstructing && <p className="status">建造中: {Math.floor(selectedBuilding.progress)}%</p>}
          </div>
        ) : selectedUnitIds.length > 0 && (
          <div className="entity-card">
            <h4>已选单位: {selectedUnitIds.length}</h4>
          </div>
        )}
      </div>

      {/* Menus Layout */}
      <div className="bottom-ui">
          {/* Production Menu */}
          <div className="production-panel">
            {selectedBuilding && !selectedBuilding.isConstructing && selectedBuilding.factionId === gameState.playerFaction && (
                <div className="production-menu">
                    <h4>生产 ({BUILDING_NAMES[selectedBuilding.type]})</h4>
                    <div className="button-grid">
                    {selectedBuilding.type === 'barracks' && playerFaction.unlockedUnits.filter(u => u !== 'harvester').map(uType => {
                        const stats = UNIT_STATS[uType];
                        const goldCost = Math.floor(stats.goldCost * playerFaction.traits.costMultiplier);
                        const mineralCost = Math.floor(stats.mineralCost * playerFaction.traits.costMultiplier);
                        return (
                        <button 
                            key={uType}
                            onClick={() => { trainUnit(selectedBuilding.id, uType); playSound('click'); }}
                            disabled={gameState.factionResources[gameState.playerFaction].gold < goldCost || gameState.factionResources[gameState.playerFaction].minerals < mineralCost}
                        >
                            {UNIT_NAMES[uType]}<br/>({goldCost}金{mineralCost > 0 ? `, ${mineralCost}矿` : ''})
                        </button>
                        );
                    })}
                    {selectedBuilding.type === 'refinery' && (
                        <button 
                        onClick={() => { trainUnit(selectedBuilding.id, 'harvester'); playSound('click'); }}
                        disabled={gameState.factionResources[gameState.playerFaction].minerals < UNIT_STATS.harvester.mineralCost * playerFaction.traits.costMultiplier}
                        >
                        {UNIT_NAMES.harvester}<br/>({Math.floor(UNIT_STATS.harvester.mineralCost * playerFaction.traits.costMultiplier)}矿)
                        </button>
                    )}
                    </div>
                </div>
            )}
          </div>

          {/* Build Menu */}
          <div className="build-menu">
            <h4>建造菜单</h4>
            <div className="button-grid">
                {playerFaction.unlockedBuildings.map(bType => (
                <button 
                    key={bType}
                    className={placingBuilding === bType ? 'active' : ''}
                    onClick={() => { setPlacingBuilding(placingBuilding === bType ? null : bType); playSound('click'); }}
                    disabled={gameState.factionResources[gameState.playerFaction].gold < BUILDING_STATS[bType].cost * playerFaction.traits.costMultiplier}
                >
                    {BUILDING_NAMES[bType]}<br/>({Math.floor(BUILDING_STATS[bType].cost * playerFaction.traits.costMultiplier)}金)
                </button>
                ))}
            </div>
          </div>
      </div>

      <div className="controls-hint">
        ESC 暂停/取消 | WASD/方向键拖拽 | 滚轮缩放 | 左键框选 | 右键移动/攻击/采矿
      </div>
    </div>
  );
}

function App() {
  const [inGame, setInGame] = useState(false);
  const [mapType, setMapType] = useState<MapType>('mountain_pass');
  const [speed, setSpeed] = useState(1.0);
  const [victoryMode, setVictoryMode] = useState<VictoryMode>('standard');
  const [factions, setFactions] = useState<FactionConfig[]>([
      { id: 'player', type: 'human', color: FACTION_COLORS[0], isPlayer: true },
      { id: 'cpu1', type: 'robot', color: FACTION_COLORS[1], isPlayer: false },
  ]);

  const addAI = () => {
      if (factions.length >= 8) return;
      const id = `cpu${factions.length}`;
      setFactions([...factions, { id, type: 'human', color: FACTION_COLORS[factions.length], isPlayer: false }]);
  };

  const removeAI = (id: string) => {
      setFactions(factions.filter(f => f.id !== id || f.isPlayer));
  };

  const updateFactionType = (id: string, type: FactionType) => {
      setFactions(factions.map(f => f.id === id ? { ...f, type } : f));
  };

  if (inGame) {
    return (
      <GameSession 
        configs={factions}
        speed={speed} 
        mapType={mapType} 
        victoryMode={victoryMode}
        onQuit={() => setInGame(false)}
      />
    );
  }

  return (
    <div className="setup-screen">
      <h1>战争：PVE 帝国之战</h1>
      
      <div className="setup-container">
        <div className="setup-main-grid">
            {/* Left Column: Faction Config */}
            <div className="setup-section faction-config">
                <h2>1. 配置阵营 (最多8个)</h2>
                <div className="faction-config-list">
                    {factions.map((f, idx) => (
                        <div key={f.id} className="faction-config-item" style={{ borderLeft: `5px solid ${f.color}` }}>
                            <span className="faction-label">{f.isPlayer ? '【玩家】' : `【AI ${idx}】`}</span>
                            <select value={f.type} onChange={(e) => updateFactionType(f.id, e.target.value as FactionType)}>
                                {(Object.keys(FACTION_TEMPLATES) as FactionType[]).map(t => (
                                    <option key={t} value={t}>{FACTION_TEMPLATES[t].name}</option>
                                ))}
                            </select>
                            {!f.isPlayer && <button className="remove-btn" onClick={() => removeAI(f.id)}>移除</button>}
                        </div>
                    ))}
                    {factions.length < 8 && <button className="add-ai-btn" onClick={addAI}>+ 添加 AI 阵营</button>}
                </div>
            </div>

            {/* Middle Column: Faction Intro & Victory Mode */}
            <div className="setup-column-middle">
                <div className="setup-section faction-info-section">
                    <h2>2. 阵营介绍</h2>
                    <FactionIntro />
                </div>
                
                <div className="setup-section victory-section">
                    <h2>3. 胜利机制</h2>
                    <div className="victory-modes">
                        <VictoryModeInfo mode="standard" active={victoryMode === 'standard'} onSelect={() => setVictoryMode('standard')} />
                        <VictoryModeInfo mode="total_war" active={victoryMode === 'total_war'} onSelect={() => setVictoryMode('total_war')} />
                    </div>
                </div>
            </div>

            {/* Right Column: Map & Speed */}
            <div className="setup-column-right">
                <div className="setup-section map-section">
                    <h2>4. 选择战场地图</h2>
                    <div className="map-selection-box">
                        <div className="map-list-horizontal">
                            {MAP_CONFIGS.map((map) => (
                                <button key={map.id} className={mapType === map.id ? 'selected' : ''} onClick={() => setMapType(map.id)}>
                                    {map.name}
                                </button>
                            ))}
                        </div>
                        <MapPreview type={mapType} />
                    </div>
                </div>

                <div className="setup-section speed-section">
                    <h2>5. 游戏发展速度 (x{speed.toFixed(2)})</h2>
                    <div className="speed-slider-container">
                        <input 
                            type="range" 
                            min="0.5" 
                            max="3.0" 
                            step="0.01" 
                            value={speed} 
                            onChange={(e) => setSpeed(parseFloat(e.target.value))}
                            className="speed-slider"
                        />
                        <div className="speed-labels">
                            <span>慢速</span>
                            <span>正常</span>
                            <span>极速</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="setup-footer">
            <button className="start-button large" onClick={() => setInGame(true)}>开始战斗</button>
        </div>
      </div>
    </div>
  );
}


export default App;
