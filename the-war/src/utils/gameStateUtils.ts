import type { GameState, FactionID, FactionType, ResourceNode, Obstacle, Unit, Building, MapType, VictoryMode, Faction, UnitType, BuildingType, ResourceType } from '../game/types';
import { MAP_WIDTH, MAP_HEIGHT, FACTION_TEMPLATES, UNIT_STATS, BUILDING_STATS } from '../game/constants';

export interface FactionConfig {
  id: FactionID;
  type: FactionType;
  color: string;
  isPlayer: boolean;
}

export const createInitialGameState = (
  configs: FactionConfig[],
  mapType: MapType = 'mountain_pass',
  victoryMode: VictoryMode = 'standard',
  developmentSpeed: number = 1.0
): GameState => {
  
  // Create factions map
  const factions: Record<FactionID, Faction> = {};
  const factionResources: Record<FactionID, Record<ResourceType, number>> = {};
  let playerFactionId: FactionID = configs[0].id;

  configs.forEach(cfg => {
    const template = FACTION_TEMPLATES[cfg.type];
    factions[cfg.id] = {
      ...template,
      id: cfg.id,
      color: cfg.color,
      unitColor: cfg.color,
    };
    factionResources[cfg.id] = { gold: 1000, minerals: 500 };
    if (cfg.isPlayer) playerFactionId = cfg.id;
  });

  // Calculate Spawn Points (max 8)
  const spawnPoints: {x: number, y: number}[] = [
    { x: 800, y: 800 }, // Top Left
    { x: MAP_WIDTH - 800, y: MAP_HEIGHT - 800 }, // Bottom Right
    { x: MAP_WIDTH - 800, y: 800 }, // Top Right
    { x: 800, y: MAP_HEIGHT - 800 }, // Bottom Left
    { x: MAP_WIDTH / 2, y: 800 }, // Top Mid
    { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 800 }, // Bottom Mid
    { x: 800, y: MAP_HEIGHT / 2 }, // Mid Left
    { x: MAP_WIDTH - 800, y: MAP_HEIGHT / 2 }, // Mid Right
  ];

  // Create resources
  const resources: ResourceNode[] = [];
  // Random scattered resources
  for (let i = 0; i < 200; i++) {
    resources.push({
      id: `res-${i}`,
      type: Math.random() > 0.6 ? 'gold' : 'minerals',
      position: {
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
      },
      amount: 2000 + Math.random() * 8000,
    });
  }

  // Guaranteed resources near each spawn point
  configs.forEach((cfg, idx) => {
      const sp = spawnPoints[idx];
      resources.push({ id: `res-guar-g-${cfg.id}`, type: 'gold', position: { x: sp.x + 200, y: sp.y + 200 }, amount: 20000 });
      resources.push({ id: `res-guar-m-${cfg.id}`, type: 'minerals', position: { x: sp.x + 350, y: sp.y + 50 }, amount: 20000 });
  });

  // Create obstacles based on map type
  const obstacles: Obstacle[] = [];
  const addObstacle = (type: Obstacle['type'], x: number, y: number, w: number, h: number) => {
    // Check if near starting positions
    const isNearSpawn = spawnPoints.some(sp => Math.hypot(x - sp.x, y - sp.y) < 600);
    if (isNearSpawn) return;

    obstacles.push({
      id: `obs-${obstacles.length}`,
      type,
      position: { x, y },
      width: w,
      height: h,
    });
  };

  if (mapType === 'mountain_pass') {
    for (let x = 0; x < MAP_WIDTH; x += 150) {
      if (Math.abs(x - MAP_WIDTH / 2) < 400 || Math.abs(x - MAP_WIDTH / 4) < 200 || Math.abs(x - (3 * MAP_WIDTH) / 4) < 200) continue;
      for (let y = MAP_HEIGHT / 2 - 300; y < MAP_HEIGHT / 2 + 300; y += 150) {
        addObstacle('mountain', x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 50, 200, 200);
      }
    }
  } else if (mapType === 'fortress') {
      spawnPoints.slice(0, configs.length).forEach(sp => {
        const angles = Array.from({ length: 40 }, (_, i) => (i / 40) * Math.PI * 2);
        angles.forEach(angle => {
          if (angle > 0.3 && angle < 1.2) return; 
          const px = sp.x + Math.cos(angle) * 700;
          const py = sp.y + Math.sin(angle) * 700;
          if (px > 0 && px < MAP_WIDTH && py > 0 && py < MAP_HEIGHT) addObstacle('mountain', px, py, 150, 150);
        });
      });
  } else if (mapType === 'labyrinth') {
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * MAP_WIDTH;
      const y = Math.random() * MAP_HEIGHT;
      addObstacle('ruins', x, y, 100 + Math.random() * 200, 40);
      addObstacle('ruins', x, y, 40, 100 + Math.random() * 200);
    }
  }

  // Add random scattered trees and rocks
  for (let i = 0; i < 200; i++) {
    addObstacle(Math.random() > 0.5 ? 'tree' : 'rock', Math.random() * MAP_WIDTH, Math.random() * MAP_HEIGHT, 60 + Math.random() * 60, 60 + Math.random() * 60);
  }

  const createUnit = (fid: FactionID, type: UnitType, pos: {x: number, y: number}): Unit => {
    const f = factions[fid];
    const stats = UNIT_STATS[type];
    return {
      id: `${fid}-u-${Math.random()}`,
      factionId: fid,
      type,
      position: pos,
      hp: stats.hp * f.traits.hpMultiplier,
      maxHp: stats.hp * f.traits.hpMultiplier,
      speed: stats.speed * f.traits.speedMultiplier,
      damage: stats.damage * f.traits.damageMultiplier,
      range: stats.range,
      state: 'idle',
    };
  };

  const createBuilding = (fid: FactionID, type: BuildingType, pos: {x: number, y: number}): Building => {
    const f = factions[fid];
    const stats = BUILDING_STATS[type];
    return {
      id: `${fid}-b-${Math.random()}`,
      factionId: fid,
      type,
      position: pos,
      hp: stats.hp * f.traits.hpMultiplier,
      maxHp: stats.hp * f.traits.hpMultiplier,
      isConstructing: false,
      progress: 100,
    };
  };

  const initialUnits: Unit[] = [];
  const initialBuildings: Building[] = [];

  configs.forEach((cfg, idx) => {
      const sp = spawnPoints[idx];
      initialBuildings.push(createBuilding(cfg.id, 'command_center', { x: sp.x, y: sp.y }));
      initialBuildings.push(createBuilding(cfg.id, 'refinery', { x: sp.x + 150, y: sp.y }));
      initialBuildings.push(createBuilding(cfg.id, 'barracks', { x: sp.x, y: sp.y + 150 }));
      
      initialUnits.push(createUnit(cfg.id, cfg.type === 'alien' ? 'swarmer' : 'infantry', { x: sp.x + 100, y: sp.y + 100 }));
      initialUnits.push(createUnit(cfg.id, 'harvester', { x: sp.x + 150, y: sp.y + 100 }));
  });

  return {
    factions,
    playerFaction: playerFactionId,
    factionResources,
    units: initialUnits,
    buildings: initialBuildings,
    resources,
    obstacles,
    effects: [],
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    mapType,
    victoryMode,
    isGameOver: false,
    winner: null,
    camera: {
      x: spawnPoints[configs.findIndex(c => c.isPlayer)].x,
      y: spawnPoints[configs.findIndex(c => c.isPlayer)].y,
      zoom: 0.8,
    },
    developmentSpeed,
    isPaused: false,
    settings: {
      musicOn: true,
      soundOn: true,
    }
  };
};
