export type FactionType = 'human' | 'robot' | 'alien';
export type FactionID = string; // Unique ID for each player instance
export type MapType = 'mountain_pass' | 'fortress' | 'open_plains' | 'labyrinth';
export type VictoryMode = 'standard' | 'total_war';

export interface Faction {
  id: FactionID;
  type: FactionType;
  name: string;
  description: string;
  color: string;
  unitColor: string;
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
  isEliminated?: boolean;
}

export type UnitType = 'infantry' | 'tank' | 'scout' | 'harvester' | 'heavy_mech' | 'swarmer';
export type BuildingType = 'command_center' | 'barracks' | 'refinery' | 'turret' | 'tech_center';
export type ResourceType = 'gold' | 'minerals';

export interface Position {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  factionId: FactionID;
  position: Position;
  hp: number;
  maxHp: number;
}

export interface Unit extends Entity {
  type: UnitType;
  speed: number;
  damage: number;
  range: number;
  targetPosition?: Position;
  targetEntityId?: string;
  destination?: Position;
  state: 'idle' | 'moving' | 'attacking' | 'gathering' | 'returning_resources';
  cargoAmount?: number;
  cargoType?: ResourceType;
  lastAttackTime?: number;
}

export interface Building extends Entity {
  type: BuildingType;
  isConstructing: boolean;
  progress: number;
  lastAttackTime?: number;
}

export interface ResourceNode {
  id: string;
  type: ResourceType;
  position: Position;
  amount: number;
}

export interface Obstacle {
  id: string;
  type: 'rock' | 'tree' | 'ruins' | 'mountain';
  position: Position;
  width: number;
  height: number;
}

export interface Effect {
  id: string;
  type: 'projectile' | 'explosion' | 'muzzle_flash';
  startPosition: Position;
  targetPosition?: Position;
  progress: number; // 0 to 1
  color: string;
}

export interface GameState {
  factions: Record<FactionID, Faction>;
  units: Unit[];
  buildings: Building[];
  resources: ResourceNode[];
  obstacles: Obstacle[];
  effects: Effect[];
  playerFaction: FactionID;
  factionResources: Record<FactionID, Record<ResourceType, number>>;
  mapWidth: number;
  mapHeight: number;
  mapType: MapType;
  victoryMode: VictoryMode;
  isGameOver: boolean;
  winner: FactionID | null;
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
  developmentSpeed: number; // 1.0 is normal
  lastAiActionTime?: number;
  isPaused: boolean;
  settings: {
    musicOn: boolean;
    soundOn: boolean;
  };
}
