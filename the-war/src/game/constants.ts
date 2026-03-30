import type { FactionID, FactionType, UnitType, BuildingType, MapType } from './types';

export const MAP_WIDTH = 8000;
export const MAP_HEIGHT = 8000;
export const BUILD_RADIUS = 1200; // 建筑必须在指挥中心半径 1200 像素内建造

export interface MapConfig {
  id: MapType;
  name: string;
  description: string;
  previewColor: string;
}

export const MAP_CONFIGS: MapConfig[] = [
  { id: 'mountain_pass', name: '纵横山脉', description: '中间有巨大的山脉横切，仅有几条狭窄小道可以通过。', previewColor: '#555' },
  { id: 'fortress', name: '环形堡垒', description: '双方基地周围都被山脉保护，只有一个狭窄的出口。', previewColor: '#443' },
  { id: 'open_plains', name: '辽阔平原', description: '地势平坦，适合大规模机械化兵团作战。', previewColor: '#252' },
  { id: 'labyrinth', name: '废墟迷宫', description: '遍布古代废墟，形成了一个复杂的迷宫地形。', previewColor: '#333' },
];

export const UNIT_PASSABILITY: Record<UnitType, string[]> = {
  infantry: ['tree', 'ruins'],
  swarmer: ['tree', 'ruins', 'rock'],
  tank: [],
  scout: ['tree'],
  harvester: [],
  heavy_mech: [],
};

export const FACTION_NAMES: Record<FactionID, string> = {
  human: '人类联盟',
  robot: '机械帝国',
  alien: '异星虫族',
};

export const UNIT_NAMES: Record<UnitType, string> = {
  infantry: '步兵',
  tank: '坦克',
  scout: '侦察车',
  harvester: '采集车',
  heavy_mech: '重型机甲',
  swarmer: '小狗',
};

export const BUILDING_NAMES: Record<BuildingType, string> = {
  command_center: '指挥中心',
  barracks: '兵营',
  refinery: '精炼厂',
  turret: '防御炮塔',
  tech_center: '科研中心',
};

export const FACTION_COLORS = [
  '#44AAFF', '#FF4444', '#44FF88', '#FFCC00', '#CC44FF', '#00FFFF', '#FF8800', '#AAAAAA'
];

export interface FactionTemplate {
  type: FactionType;
  name: string;
  description: string;
  traits: {
    speedMultiplier: number;
    hpMultiplier: number;
    damageMultiplier: number;
    costMultiplier: number;
    miningMultiplier: number;
    harvestersPerCC: number;
    barracksPerCC: number;
    unitsPerBarracks: Partial<Record<UnitType, number>>;
  };
  unlockedUnits: UnitType[];
  unlockedBuildings: BuildingType[];
}

export const FACTION_TEMPLATES: Record<FactionType, FactionTemplate> = {
  human: {
    type: 'human',
    name: '人类联盟',
    description: '平衡型派系，各项指标均衡，适应力强。',
    traits: {
      speedMultiplier: 1.0,
      hpMultiplier: 1.0,
      damageMultiplier: 1.0,
      costMultiplier: 1.0,
      miningMultiplier: 1.0,
      harvestersPerCC: 8,
      barracksPerCC: 3,
      unitsPerBarracks: {
        infantry: 8,
        tank: 2,
        scout: 4,
        harvester: 0,
        heavy_mech: 1,
        swarmer: 0,
      }
    },
    unlockedUnits: ['infantry', 'tank', 'scout', 'harvester'],
    unlockedBuildings: ['command_center', 'barracks', 'refinery', 'turret'],
  },
  robot: {
    type: 'robot',
    name: '机械帝国',
    description: '重装型派系。单位血量高、伤害足，但造价昂贵且移动缓慢。',
    traits: {
      speedMultiplier: 0.8,
      hpMultiplier: 1.5,
      damageMultiplier: 1.3,
      costMultiplier: 1.5,
      miningMultiplier: 1.2,
      harvestersPerCC: 6,
      barracksPerCC: 2,
      unitsPerBarracks: {
        infantry: 4,
        tank: 2,
        scout: 2,
        harvester: 0,
        heavy_mech: 2,
        swarmer: 0,
      }
    },
    unlockedUnits: ['infantry', 'tank', 'heavy_mech', 'harvester'],
    unlockedBuildings: ['command_center', 'barracks', 'refinery', 'turret', 'tech_center'],
  },
  alien: {
    type: 'alien',
    name: '异星虫族',
    description: '人海战术派系。单位廉价、移动极快，但非常脆弱。',
    traits: {
      speedMultiplier: 1.4,
      hpMultiplier: 0.6,
      damageMultiplier: 0.8,
      costMultiplier: 0.5,
      miningMultiplier: 0.8,
      harvestersPerCC: 12,
      barracksPerCC: 5,
      unitsPerBarracks: {
        infantry: 0,
        tank: 0,
        scout: 8,
        harvester: 0,
        heavy_mech: 0,
        swarmer: 25,
      }
    },
    unlockedUnits: ['swarmer', 'scout', 'harvester'],
    unlockedBuildings: ['command_center', 'barracks', 'refinery'],
  },
};

export const UNIT_STATS: Record<UnitType, { hp: number; speed: number; damage: number; range: number; goldCost: number; mineralCost: number }> = {
  infantry: { hp: 50, speed: 4, damage: 5, range: 120, goldCost: 50, mineralCost: 0 },
  tank: { hp: 200, speed: 2.5, damage: 25, range: 180, goldCost: 200, mineralCost: 50 },
  scout: { hp: 30, speed: 6.5, damage: 2, range: 60, goldCost: 30, mineralCost: 0 },
  harvester: { hp: 120, speed: 3.5, damage: 0, range: 30, goldCost: 0, mineralCost: 100 },
  heavy_mech: { hp: 450, speed: 1.8, damage: 60, range: 220, goldCost: 500, mineralCost: 200 },
  swarmer: { hp: 25, speed: 5.5, damage: 4, range: 30, goldCost: 20, mineralCost: 0 },
};

export const BUILDING_STATS: Record<BuildingType, { hp: number; cost: number; buildTime: number; width: number; height: number; range?: number; damage?: number }> = {
  command_center: { hp: 2000, cost: 1000, buildTime: 60, width: 120, height: 120 },
  barracks: { hp: 800, cost: 300, buildTime: 20, width: 80, height: 80 },
  refinery: { hp: 600, cost: 500, buildTime: 30, width: 80, height: 80 },
  turret: { hp: 500, cost: 250, buildTime: 15, width: 40, height: 40, range: 400, damage: 15 },
  tech_center: { hp: 1000, cost: 800, buildTime: 45, width: 100, height: 100 },
};

export const TURRET_STATS = {
    range: 400,
    damage: 15,
    attackCooldown: 800, // ms
};
