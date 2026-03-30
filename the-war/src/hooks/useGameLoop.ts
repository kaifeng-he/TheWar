import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, Unit, ResourceNode, Position, UnitType, BuildingType, FactionID, MapType, VictoryMode, Building } from '../game/types';
import { MAP_WIDTH, MAP_HEIGHT, UNIT_STATS, BUILDING_STATS, UNIT_PASSABILITY, BUILD_RADIUS } from '../game/constants';
import { createInitialGameState } from '../utils/gameStateUtils';
import type { FactionConfig } from '../utils/gameStateUtils';

export function useGameLoop(factionConfigs: FactionConfig[], developmentSpeed: number, mapType: MapType, victoryMode: VictoryMode) {
  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState(factionConfigs, mapType, victoryMode, developmentSpeed));
  const gameStateRef = useRef<GameState>(gameState);

  function placeBuildingInternal(state: GameState, factionId: FactionID, type: BuildingType, position: Position) {
    const stats = BUILDING_STATS[type];
    const faction = state.factions[factionId];
    const goldCost = stats.cost * faction.traits.costMultiplier;
    const factionRes = state.factionResources[factionId];

    if (factionRes.gold < goldCost) return false;

    // Check build radius constraint: must be near a Command Center (except for CC itself)
    const playerCCs = state.buildings.filter(b => b.factionId === factionId && b.type === 'command_center' && !b.isConstructing);
    
    if (type !== 'command_center') {
        if (playerCCs.length === 0) return false;

        const isNearCC = playerCCs.some(cc => {
            const dx = cc.position.x - position.x;
            const dy = cc.position.y - position.y;
            return Math.sqrt(dx * dx + dy * dy) <= BUILD_RADIUS;
        });
        if (!isNearCC) return false;

        // Barracks limit check
        if (type === 'barracks') {
            const currentBarracks = state.buildings.filter(b => b.factionId === factionId && b.type === 'barracks').length;
            if (currentBarracks >= playerCCs.length * faction.traits.barracksPerCC) return false;
        }
    }

    // Check collision with other buildings
    const hasCollision = state.buildings.some(b => {
      const bStats = BUILDING_STATS[b.type];
      const dist = Math.sqrt(Math.pow(b.position.x - position.x, 2) + Math.pow(b.position.y - position.y, 2));
      return dist < (stats.width + bStats.width) / 1.5;
    });
    if (hasCollision) return false;

    factionRes.gold -= goldCost;

    state.buildings.push({
      id: `b-${Date.now()}-${Math.random()}`,
      factionId,
      type,
      position,
      hp: stats.hp * faction.traits.hpMultiplier,
      maxHp: stats.hp * faction.traits.hpMultiplier,
      isConstructing: true,
      progress: 0,
    });
    return true;
  }

  function trainUnitInternal(state: GameState, buildingId: string, unitType: UnitType) {
    const building = state.buildings.find(b => b.id === buildingId);
    if (!building || building.isConstructing) return;

    // Enforce producer building type
    if (unitType === 'harvester' && building.type !== 'refinery') return;
    if (unitType !== 'harvester' && building.type !== 'barracks') return;

    const factionId = building.factionId;
    const faction = state.factions[factionId];
    const stats = UNIT_STATS[unitType];
    const factionRes = state.factionResources[factionId];
    
    // Check capacity
    const factionUnits = state.units.filter(u => u.factionId === factionId);
    const factionBuildings = state.buildings.filter(b => b.factionId === factionId);
    const ccCount = factionBuildings.filter(b => b.type === 'command_center' && !b.isConstructing).length;
    const barracksCount = factionBuildings.filter(b => b.type === 'barracks' && !b.isConstructing).length;

    if (unitType === 'harvester') {
        const harvesterLimit = ccCount * faction.traits.harvestersPerCC;
        const currentHarvesters = factionUnits.filter(u => u.type === 'harvester').length;
        if (currentHarvesters >= harvesterLimit) return;
    } else {
        const limitPerType = faction.traits.unitsPerBarracks[unitType] || 0;
        const totalLimit = barracksCount * limitPerType;
        const currentUnits = factionUnits.filter(u => u.type === unitType).length;
        if (currentUnits >= totalLimit) return;
    }

    const goldCost = stats.goldCost * faction.traits.costMultiplier;
    const mineralCost = stats.mineralCost * faction.traits.costMultiplier;

    if (factionRes.gold < goldCost || factionRes.minerals < mineralCost) return;

    factionRes.gold -= goldCost;
    factionRes.minerals -= mineralCost;

    const spawnPos = { x: building.position.x + 100, y: building.position.y + 100 };

    state.units.push({
      id: `u-${Date.now()}-${Math.random()}`,
      factionId: building.factionId,
      type: unitType,
      position: spawnPos,
      hp: stats.hp * faction.traits.hpMultiplier,
      maxHp: stats.hp * faction.traits.hpMultiplier,
      speed: stats.speed * faction.traits.speedMultiplier,
      damage: stats.damage * faction.traits.damageMultiplier,
      range: stats.range,
      state: 'idle',
    });
  }

  // Sync ref with state
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Audio helper with simple cache/throttle
  const lastSoundTime = useRef<Record<string, number>>({});
  const playSound = useCallback((soundName: 'hit' | 'explode' | 'hurt' | 'click') => {
    if (!gameStateRef.current.settings.soundOn) return;
    
    // Throttle sounds to avoid overwhelming the browser
    const now = Date.now();
    if (lastSoundTime.current[soundName] && now - lastSoundTime.current[soundName] < 50) return;
    lastSoundTime.current[soundName] = now;

    const audio = new Audio(`/music/${soundName}.${soundName === 'click' || soundName === 'hurt' ? 'wav' : 'mp3'}`);
    audio.volume = 0.4;
    audio.play().catch(() => {});
  }, []);

  useEffect(() => {
    let animationFrameId: number;

    const update = () => {
      setGameState(currentState => {
        if (currentState.isPaused) return currentState;
        
        const newState = { ...currentState };
        const devSpeed = newState.developmentSpeed || 1.0;

        // --- Update Effects ---
        newState.effects = (currentState.effects || [])
          .map(eff => ({ ...eff, progress: eff.progress + 0.05 * devSpeed }))
          .filter(eff => eff.progress < 1);

        // Helper function to find nearest resource node
        const findNearestResource = (pos: Position, type?: string): ResourceNode | null => {
          let nearestNode: ResourceNode | null = null;
          let minDist = Infinity;
          
          currentState.resources.forEach(node => {
            if (node.amount <= 0) return;
            if (type && node.type !== type) return;
            
            const dx = node.position.x - pos.x;
            const dy = node.position.y - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < minDist) {
              minDist = dist;
              nearestNode = node;
            }
          });
          return nearestNode;
        };

        // --- Update Units ---
        // Create the new units array first so we can modify it directly
        newState.units = currentState.units.map(u => ({ ...u }));

        newState.units.forEach(unit => {
          // 1. Movement Logic with Collision Avoidance
          if ((unit.state === 'moving' || unit.state === 'gathering' || unit.state === 'returning_resources' || unit.state === 'attacking') && unit.targetPosition) {
            const dx = unit.targetPosition.x - unit.position.x;
            const dy = unit.targetPosition.y - unit.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            const stopThreshold = unit.state === 'attacking' ? unit.range * 0.8 : (unit.type === 'harvester' ? 30 : 5);

            if (distance < Math.max(unit.speed, stopThreshold)) {
              if (unit.state === 'moving') {
                unit.state = 'idle';
                unit.targetPosition = undefined;
                unit.destination = undefined;
              }
            } else {
              let moveX = (dx / distance) * unit.speed * devSpeed;
              let moveY = (dy / distance) * unit.speed * devSpeed;

              // Collision Avoidance (Units)
              newState.units.forEach(other => {
                if (other.id === unit.id) return;
                const ox = other.position.x - unit.position.x;
                const oy = other.position.y - unit.position.y;
                const oDist = Math.sqrt(ox * ox + oy * oy);
                const minColDist = 30;
                if (oDist < minColDist && oDist > 0.1) {
                  moveX -= (ox / oDist) * 1.0;
                  moveY -= (oy / oDist) * 1.0;
                }
              });

              // Collision (Buildings)
              currentState.buildings.forEach(building => {
                const bStats = BUILDING_STATS[building.type];
                const bx = building.position.x - unit.position.x;
                const by = building.position.y - unit.position.y;
                const bDist = Math.sqrt(bx * bx + by * by);
                const minColDist = Math.max(bStats.width, bStats.height) / 2 + 15;
                if (bDist < minColDist && bDist > 0.1) {
                  const pushFactor = 2.0;
                  moveX -= (bx / bDist) * pushFactor;
                  moveY -= (by / bDist) * pushFactor;
                }
              });

              // Collision (Obstacles)
              currentState.obstacles.forEach(obs => {
                const ox = obs.position.x - unit.position.x;
                const oy = obs.position.y - unit.position.y;
                const oDist = Math.sqrt(ox * ox + oy * oy);
                const baseRadius = Math.max(obs.width, obs.height) / 2;
                const minColDist = baseRadius + (obs.type === 'mountain' ? 15 : 8);
                if (oDist < minColDist && oDist > 0.1) {
                  const passable = UNIT_PASSABILITY[unit.type].includes(obs.type);
                  if (!passable) {
                    const repulsion = 3.0;
                    moveX -= (ox / oDist) * repulsion;
                    moveY -= (oy / oDist) * repulsion;
                  }
                }
              });

              unit.position = {
                x: Math.max(0, Math.min(MAP_WIDTH, unit.position.x + moveX)),
                y: Math.max(0, Math.min(MAP_HEIGHT, unit.position.y + moveY)),
              };
            }
          }

          // 2. Combat Logic
          if (unit.state === 'attacking' && unit.targetEntityId) {
            // Find target in current state for stats but we will modify HP in newState or building array
            const target = newState.units.find(u => u.id === unit.targetEntityId) || 
                           newState.buildings.find(b => b.id === unit.targetEntityId);
            
            if (target && target.hp > 0) {
              const dx = target.position.x - unit.position.x;
              const dy = target.position.y - unit.position.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              if (distance <= unit.range) {
                const attackCooldown = 1000 / devSpeed;
                const now = performance.now();
                if (!unit.lastAttackTime || now - unit.lastAttackTime > attackCooldown) {
                  unit.lastAttackTime = now;
                  
                  newState.effects.push({
                    id: `eff-muzzle-${unit.id}-${now}`,
                    type: 'muzzle_flash',
                    startPosition: { ...unit.position },
                    progress: 0,
                    color: 'rgba(255, 200, 50, 0.8)',
                  });

                  newState.effects.push({
                    id: `eff-proj-${unit.id}-${now}`,
                    type: 'projectile',
                    startPosition: { ...unit.position },
                    targetPosition: { ...target.position },
                    progress: 0,
                    color: unit.type === 'tank' || unit.type === 'heavy_mech' ? '#FFF' : '#FF0',
                  });

                  // Apply damage directly
                  target.hp -= unit.damage;
                  
                  if (target.hp <= 0) {
                    playSound('explode');
                    newState.effects.push({
                      id: `eff-exp-${target.id}-${now}`,
                      type: 'explosion',
                      startPosition: { ...target.position },
                      progress: 0,
                      color: 'rgba(255, 80, 0, 0.8)',
                    });
                  } else {
                    playSound('hit');
                  }
                }
              } else {
                unit.targetPosition = target.position;
              }
            } else {
              unit.state = 'idle';
              unit.targetEntityId = undefined;
            }
          }

          // 3. Resource Gathering
          if (unit.type === 'harvester') {
            const fTrait = newState.factions[unit.factionId].traits;
            if (unit.state === 'gathering' && unit.targetEntityId) {
              let node = newState.resources.find(r => r.id === unit.targetEntityId);
              if (!node || node.amount <= 0) {
                const nextNode = findNearestResource(unit.position);
                if (nextNode) {
                  unit.targetEntityId = nextNode.id;
                  unit.targetPosition = nextNode.position;
                  node = nextNode;
                } else {
                  unit.state = 'idle';
                }
              }

              if (node && node.amount > 0) {
                const dx = node.position.x - unit.position.x;
                const dy = node.position.y - unit.position.y;
                if (Math.sqrt(dx * dx + dy * dy) < 40) {
                  const gatherRate = 0.5 * devSpeed * fTrait.miningMultiplier;
                  const amount = Math.min(node.amount, gatherRate);
                  node.amount -= amount;
                  unit.cargoAmount = (unit.cargoAmount || 0) + amount;
                  unit.cargoType = node.type;

                  if (unit.cargoAmount >= 100) {
                    // Find nearest refinery
                    let nearestRefinery: Building | null = null;
                    let minDist = Infinity;
                    newState.buildings.forEach(b => {
                        if (b.factionId === unit.factionId && b.type === 'refinery' && !b.isConstructing) {
                            const dx = b.position.x - unit.position.x;
                            const dy = b.position.y - unit.position.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist < minDist) {
                                minDist = dist;
                                nearestRefinery = b;
                            }
                        }
                    });

                    if (nearestRefinery) {
                      unit.state = 'returning_resources';
                      unit.targetPosition = (nearestRefinery as Building).position;
                    }
                  }
                }
              }
            } else if (unit.state === 'returning_resources') {
              // Find nearest refinery again to be safe
              let nearestRefinery: Building | null = null;
              let minDist = Infinity;
              newState.buildings.forEach(b => {
                  if (b.factionId === unit.factionId && b.type === 'refinery' && !b.isConstructing) {
                      const dx = b.position.x - unit.position.x;
                      const dy = b.position.y - unit.position.y;
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      if (dist < minDist) {
                          minDist = dist;
                          nearestRefinery = b;
                      }
                  }
              });

              if (nearestRefinery) {
                const base = nearestRefinery as Building;
                const dx = base.position.x - unit.position.x;
                const dy = base.position.y - unit.position.y;
                if (Math.sqrt(dx * dx + dy * dy) < 60) {
                  newState.factionResources[unit.factionId][unit.cargoType!] += unit.cargoAmount!;
                  unit.cargoAmount = 0;
                  const node = findNearestResource(unit.position, unit.cargoType);
                  if (node) {
                    unit.state = 'gathering';
                    unit.targetEntityId = node.id;
                    unit.targetPosition = node.position;
                  } else {
                    unit.state = 'idle';
                  }
                }
              }
            }
          }
        });

        // 4. Building Combat (Turrets)
        newState.buildings.forEach(b => {
          if (b.type === 'turret' && !b.isConstructing) {
            const stats = BUILDING_STATS.turret;
            const range = stats.range || 400;
            const damage = (stats.damage || 15) * newState.factions[b.factionId].traits.damageMultiplier;
            
            let nearestEnemy: Unit | Building | null = null;
            let minDist = range;
            
            // Search enemies
            newState.units.forEach(u => {
                if (u.factionId !== b.factionId && u.hp > 0) {
                    const dist = Math.sqrt(Math.pow(u.position.x - b.position.x, 2) + Math.pow(u.position.y - b.position.y, 2));
                    if (dist < minDist) {
                        minDist = dist;
                        nearestEnemy = u;
                    }
                }
            });
            
            // If no enemy unit, search enemy buildings
            if (!nearestEnemy) {
                newState.buildings.forEach(ob => {
                    if (ob.factionId !== b.factionId && ob.hp > 0) {
                        const dist = Math.sqrt(Math.pow(ob.position.x - b.position.x, 2) + Math.pow(ob.position.y - b.position.y, 2));
                        if (dist < minDist) {
                            minDist = dist;
                            nearestEnemy = ob;
                        }
                    }
                });
            }
            
            if (nearestEnemy) {
                const attackCooldown = 200 / devSpeed;
                const now = performance.now();
                if (!b.lastAttackTime || now - b.lastAttackTime > attackCooldown) {
                    b.lastAttackTime = now;
                    
                    newState.effects.push({
                        id: `eff-turret-${b.id}-${now}`,
                        type: 'projectile',
                        startPosition: { ...b.position },
                        targetPosition: { ...nearestEnemy.position },
                        progress: 0,
                        color: '#F33',
                    });
                    
                    nearestEnemy.hp -= damage;
                    if (nearestEnemy.hp <= 0) {
                        playSound('explode');
                        newState.effects.push({
                            id: `eff-exp-${nearestEnemy.id}-${now}`,
                            type: 'explosion',
                            startPosition: { ...nearestEnemy.position },
                            progress: 0,
                            color: 'rgba(255, 80, 0, 0.8)',
                        });
                    } else {
                        playSound('hit');
                    }
                }
            }
          }
        });

        // We need to re-assign or filter in place
        // Actually since we modified the unit objects themselves in the array, it should be fine

        // Auto-Attack and Resume Movement
        newState.units = newState.units.map(unit => {
          // Attack enemies even while moving or already attacking something far away
          if ((unit.state === 'idle' || unit.state === 'moving' || unit.state === 'attacking') && unit.damage > 0) {
            let nearestEnemy: Unit | null = null;
            let minDist = unit.range * 1.5;

            // If already attacking a unit that is within range, don't switch targets to avoid flip-flopping
            if (unit.state === 'attacking' && unit.targetEntityId) {
                const currentTarget = newState.units.find(u => u.id === unit.targetEntityId) || 
                                     newState.buildings.find(b => b.id === unit.targetEntityId);
                if (currentTarget) {
                    const dx = currentTarget.position.x - unit.position.x;
                    const dy = currentTarget.position.y - unit.position.y;
                    const currentDist = Math.sqrt(dx * dx + dy * dy);
                    
                    // If current target is a unit and is already in range, stay on it
                    const isTargetUnit = newState.units.some(u => u.id === unit.targetEntityId);
                    if (isTargetUnit && currentDist <= unit.range) return unit;
                    
                    // If current target is far away, we can be distracted by something closer
                    minDist = Math.min(minDist, currentDist * 0.7);
                }
            }

            newState.units.forEach(u => {
              if (u.factionId !== unit.factionId && u.hp > 0) {
                const dx = u.position.x - unit.position.x;
                const dy = u.position.y - unit.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                  minDist = dist;
                  nearestEnemy = u;
                }
              }
            });

            if (nearestEnemy) {
              return { ...unit, state: 'attacking', targetEntityId: (nearestEnemy as Unit).id, targetPosition: (nearestEnemy as Unit).position };
            }
          }
          
          // Resume movement if idle but has destination
          if (unit.state === 'idle' && unit.destination) {
            return { ...unit, state: 'moving', targetPosition: unit.destination };
          }
          
          return unit;
        });

        // Update Buildings
        newState.buildings = newState.buildings.map(b => {
          if (b.isConstructing && b.progress < 100) {
            const stats = BUILDING_STATS[b.type];
            const progressInc = (100 / (stats.buildTime * 60)) * devSpeed;
            const newProgress = Math.min(100, b.progress + progressInc);
            return { ...b, progress: newProgress, isConstructing: newProgress < 100 };
          }
          return b;
        });

        newState.units = newState.units.filter(u => u.hp > 0);
        newState.buildings = newState.buildings.filter(b => b.hp > 0);

        // --- AI Logic ---
        const now = performance.now();
        if (!newState.lastAiActionTime || now - newState.lastAiActionTime > 3000) {
          newState.lastAiActionTime = now;
          
          Object.keys(newState.factionResources).forEach(fid => {
            const factionId = fid as FactionID;
            if (factionId === newState.playerFaction) return;

            const faction = newState.factions[factionId];
            const factionRes = newState.factionResources[factionId];
            const factionUnits = newState.units.filter(u => u.factionId === factionId);
            const factionBuildings = newState.buildings.filter(b => b.factionId === factionId);
            const ccCount = factionBuildings.filter(b => b.type === 'command_center').length;
            const cc = factionBuildings.find(b => b.type === 'command_center' && !b.isConstructing);
            
            if (!cc) return; // AI lost CC

            // --- Strategic Decision: Expansion (New Command Center) ---
            // If we have plenty of gold, but limited slots for harvesters or barracks, build a new CC
            const currentHarvesters = factionUnits.filter(u => u.type === 'harvester').length;
            const currentBarracks = factionBuildings.filter(b => b.type === 'barracks').length;
            const harvesterLimit = ccCount * faction.traits.harvestersPerCC;
            const barracksLimit = ccCount * faction.traits.barracksPerCC;
            
            const needsExpansion = (currentHarvesters >= harvesterLimit - 1) || (currentBarracks >= barracksLimit);
            const canAffordCC = factionRes.gold >= BUILDING_STATS.command_center.cost;
            const underCCLimit = ccCount < 5; // Max 5 CCs for AI to prevent infinite growth

            if (needsExpansion && canAffordCC && underCCLimit) {
                // Find a resource node far from current CCs to expand towards
                const distantResource = newState.resources.find(r => {
                    return factionBuildings.filter(b => b.type === 'command_center').every(b => {
                        const dist = Math.sqrt(Math.pow(b.position.x - r.position.x, 2) + Math.pow(b.position.y - r.position.y, 2));
                        return dist > 1500 && dist < 4000;
                    });
                });

                if (distantResource) {
                    const stats = BUILDING_STATS.command_center;
                    const factionRes = newState.factionResources[factionId];
                    const goldCost = stats.cost * faction.traits.costMultiplier;
                    
                    // CC is special: It doesn't need to be near another CC (obviously, it's the anchor)
                    // But for the sake of the game mechanic, we'll allow AI to place it
                    // Manual bypass of placeBuildingInternal for CC placement
                    factionRes.gold -= goldCost;
                    newState.buildings.push({
                        id: `b-cc-${Date.now()}-${Math.random()}`,
                        factionId,
                        type: 'command_center',
                        position: { 
                            x: distantResource.position.x + (Math.random() - 0.5) * 300, 
                            y: distantResource.position.y + (Math.random() - 0.5) * 300 
                        },
                        hp: stats.hp * faction.traits.hpMultiplier,
                        maxHp: stats.hp * faction.traits.hpMultiplier,
                        isConstructing: true,
                        progress: 0,
                    });
                }
            }

            // 1. Economic Expansion (Harvesters)
            const harvesterCount = factionUnits.filter(u => u.type === 'harvester').length;
            const targetHarvesters = ccCount * faction.traits.harvestersPerCC;
            const availableRefinery = factionBuildings.find(b => b.type === 'refinery' && !b.isConstructing);
            if (harvesterCount < targetHarvesters && factionRes.minerals >= 100 && availableRefinery) {
              trainUnitInternal(newState, availableRefinery.id, 'harvester');
            }

            // 2. Building Construction
            const barracksCount = factionBuildings.filter(b => b.type === 'barracks').length;
            const refineryCount = factionBuildings.filter(b => b.type === 'refinery').length;
            const turretCount = factionBuildings.filter(b => b.type === 'turret').length;

            const targetBarracks = ccCount * faction.traits.barracksPerCC;
            const targetRefineries = ccCount * 2;
            const targetTurrets = ccCount * 3;

            // Decision: Build Refinery
            if (refineryCount < targetRefineries && factionRes.gold >= BUILDING_STATS.refinery.cost) {
                // Try to build near CC but towards resources
                const nearestResource = findNearestResource(cc.position);
                if (nearestResource) {
                    const dx = nearestResource.position.x - cc.position.x;
                    const dy = nearestResource.position.y - cc.position.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const pos = {
                        x: cc.position.x + (dx / dist) * 200 + (Math.random() - 0.5) * 100,
                        y: cc.position.y + (dy / dist) * 200 + (Math.random() - 0.5) * 100,
                    };
                    placeBuildingInternal(newState, factionId, 'refinery', pos);
                }
            }

            // Decision: Build Barracks
            if (barracksCount < targetBarracks && factionRes.gold >= BUILDING_STATS.barracks.cost) {
                const pos = {
                    x: cc.position.x + (Math.random() - 0.5) * 400,
                    y: cc.position.y + (Math.random() - 0.5) * 400,
                };
                placeBuildingInternal(newState, factionId, 'barracks', pos);
            }

            // Decision: Build Turret
            if (turretCount < targetTurrets && factionRes.gold >= BUILDING_STATS.turret.cost && barracksCount >= 1) {
                const pos = {
                    x: cc.position.x + (Math.random() - 0.5) * 600,
                    y: cc.position.y + (Math.random() - 0.5) * 600,
                };
                placeBuildingInternal(newState, factionId, 'turret', pos);
            }

            // 3. Military Production
            factionBuildings.forEach(b => {
                if (b.type === 'barracks' && !b.isConstructing) {
                    const unitToTrain = faction.unlockedUnits.find(ut => ut !== 'harvester' && ut !== 'scout');
                    if (unitToTrain) {
                        trainUnitInternal(newState, b.id, unitToTrain);
                    }
                }
            });

            // 4. Command Idle Harvesters
            factionUnits.forEach(u => {
              if (u.type === 'harvester' && u.state === 'idle') {
                const node = findNearestResource(u.position);
                if (node) {
                  u.state = 'gathering';
                  u.targetEntityId = node.id;
                  u.targetPosition = node.position;
                }
              }
            });

            // 5. Strategic Command (Defend / Attack nearest enemy)
            const combatUnits = factionUnits.filter(u => u.damage > 0);
            const idleCombatUnits = combatUnits.filter(u => u.state === 'idle');

            // Find nearest enemy building or unit from any other faction
            let globalNearestTarget: Unit | Building | null = null;
            let globalMinDist = Infinity;

            [...newState.units, ...newState.buildings].forEach((e: Unit | Building) => {
                if (e.factionId !== factionId && e.hp > 0) {
                    const dist = Math.hypot(e.position.x - cc.position.x, e.position.y - cc.position.y);
                    if (dist < globalMinDist) {
                        globalMinDist = dist;
                        globalNearestTarget = e;
                    }
                }
            });

            if (globalNearestTarget) {
                const target = globalNearestTarget;
                idleCombatUnits.forEach(u => {
                  u.state = 'attacking';
                  u.targetEntityId = target.id;
                  u.targetPosition = target.position;
                  u.destination = target.position;
                });
            }
          });
        }

        // --- Victory / Defeat Detection ---
        if (!newState.isGameOver) {
            const activeFactionIds = Object.keys(newState.factions).filter(fid => !newState.factions[fid].isEliminated);
            
            activeFactionIds.forEach(fid => {
                const factionUnits = newState.units.filter(u => u.factionId === fid);
                const factionBuildings = newState.buildings.filter(b => b.factionId === fid);
                const res = newState.factionResources[fid];
                
                let isEliminated = false;
                if (newState.victoryMode === 'standard') {
                    const ccCount = factionBuildings.filter(b => b.type === 'command_center').length;
                    if (ccCount === 0) isEliminated = true;
                } else {
                    // Total War: No units, no buildings, and cannot afford to buy anything
                    const canAffordSomething = res.gold >= 50 || res.minerals >= 100; // Cost of infantry or harvester
                    
                    if (factionUnits.length === 0 && factionBuildings.length === 0 && !canAffordSomething) {
                        isEliminated = true;
                    } else if (factionBuildings.filter(b => b.type === 'command_center').length === 0 && 
                               factionUnits.length === 0 && 
                               res.gold < BUILDING_STATS.command_center.cost) {
                        // No CC, no units, can't afford CC
                        isEliminated = true;
                    }
                }

                if (isEliminated) {
                    newState.factions[fid].isEliminated = true;
                    // Kill remaining units/buildings just in case
                    newState.units = newState.units.filter(u => u.factionId !== fid);
                    newState.buildings = newState.buildings.filter(b => b.factionId !== fid);
                }
            });

            const remainingFactions = Object.keys(newState.factions).filter(fid => !newState.factions[fid].isEliminated);
            if (remainingFactions.length <= 1) {
                newState.isGameOver = true;
                newState.winner = remainingFactions[0] || null;
                newState.isPaused = true;
            }
        }

        return newState;
      });
      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState.playerFaction, playSound]);

  const trainUnit = useCallback((buildingId: string, unitType: UnitType) => {
    setGameState(prev => {
      const newState = { ...prev };
      trainUnitInternal(newState, buildingId, unitType);
      return newState;
    });
  }, []);

  const placeBuilding = useCallback((factionId: FactionID, type: BuildingType, position: Position) => {
    setGameState(prev => {
      const newState = { ...prev, factionResources: JSON.parse(JSON.stringify(prev.factionResources)) };
      const success = placeBuildingInternal(newState, factionId, type, position);
      return success ? newState : prev;
    });
  }, []);

  const moveUnits = useCallback((unitIds: string[], target: Position, targetEntityId?: string) => {
    setGameState(prev => ({
      ...prev,
      units: prev.units.map(u => {
        if (!unitIds.includes(u.id)) return u;

        const resource = prev.resources.find(r => r.id === targetEntityId);
        if (u.type === 'harvester' && resource) {
          return { ...u, state: 'gathering', targetEntityId, targetPosition: target, destination: undefined };
        }

        const enemy = prev.units.find(en => en.id === targetEntityId && en.factionId !== u.factionId) ||
                      prev.buildings.find(b => b.id === targetEntityId && b.factionId !== u.factionId);
        if (enemy) {
          return { ...u, state: 'attacking', targetEntityId, targetPosition: target, destination: undefined };
        }

        const jitter = unitIds.length > 1 ? 60 : 0;
        const offsetTarget = {
          x: target.x + (Math.random() - 0.5) * jitter,
          y: target.y + (Math.random() - 0.5) * jitter,
        };

        return { ...u, state: 'moving', targetPosition: offsetTarget, destination: offsetTarget, targetEntityId: undefined };
      }),
    }));
  }, []);

  const moveCamera = useCallback((dx: number, dy: number) => {
    setGameState(prev => ({
      ...prev,
      camera: {
        ...prev.camera,
        x: Math.max(0, Math.min(MAP_WIDTH, prev.camera.x + dx)),
        y: Math.max(0, Math.min(MAP_HEIGHT, prev.camera.y + dy)),
      },
    }));
  }, []);

  const updateZoom = useCallback((delta: number) => {
    setGameState(prev => {
      const zoomSpeed = 0.001;
      const newZoom = Math.max(0.1, Math.min(2, prev.camera.zoom - delta * zoomSpeed));
      return {
        ...prev,
        camera: {
          ...prev.camera,
          zoom: newZoom,
        },
      };
    });
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    setGameState(prev => ({ ...prev, isPaused: paused }));
  }, []);

  const toggleSetting = useCallback((setting: 'musicOn' | 'soundOn') => {
    setGameState(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [setting]: !prev.settings[setting]
      }
    }));
  }, []);

  return { gameState, moveUnits, moveCamera, updateZoom, trainUnit, placeBuilding, setPaused, toggleSetting, playSound };
}
