import React, { useRef, useEffect, useState } from 'react';
import type { GameState, Position, BuildingType } from '../game/types';
import { MAP_WIDTH, MAP_HEIGHT, UNIT_NAMES, BUILDING_NAMES, BUILDING_STATS, BUILD_RADIUS } from '../game/constants';

interface GameCanvasProps {
  gameState: GameState;
  selectedUnitIds: string[];
  onSelect: (ids: string[]) => void;
  onMove: (target: Position, targetEntityId?: string) => void;
  onCameraMove: (dx: number, dy: number) => void;
  onZoom: (delta: number) => void;
  placingBuilding: BuildingType | null;
  onPlaceBuilding: (type: BuildingType, pos: Position) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  gameState, selectedUnitIds, onSelect, onMove, onCameraMove, onZoom, 
  placingBuilding, onPlaceBuilding 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ start: Position; end: Position } | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<Position>({ x: 0, y: 0 });

  const activeKeys = useRef<Set<string>>(new Set());
  const zoomRef = useRef(gameState.camera.zoom);
  
  // Keep zoomRef in sync
  useEffect(() => {
    zoomRef.current = gameState.camera.zoom;
  }, [gameState.camera.zoom]);

  // Use a single animation loop for camera movement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => activeKeys.current.add(e.key.toLowerCase());
    const handleKeyUp = (e: KeyboardEvent) => activeKeys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    let frameId: number;
    const moveLoop = () => {
      // CRITICAL FIX: The speed is normalized by the zoom factor. 
      // We use a base speed (e.g., 15) and divide by zoom to move the camera 
      // the same amount of 'screen pixels' regardless of zoom level.
      const baseSpeed = 15;
      const speed = baseSpeed / zoomRef.current;
      
      let dx = 0, dy = 0;
      if (activeKeys.current.has('w') || activeKeys.current.has('arrowup')) dy -= speed;
      if (activeKeys.current.has('s') || activeKeys.current.has('arrowdown')) dy += speed;
      if (activeKeys.current.has('a') || activeKeys.current.has('arrowleft')) dx -= speed;
      if (activeKeys.current.has('d') || activeKeys.current.has('arrowright')) dx += speed;
      
      if (dx !== 0 || dy !== 0) onCameraMove(dx, dy);
      frameId = requestAnimationFrame(moveLoop);
    };
    frameId = requestAnimationFrame(moveLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(frameId);
    };
  }, [onCameraMove]); // Only depend on the callback

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => { e.preventDefault(); onZoom(e.deltaY); };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [onZoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const zoom = gameState.camera.zoom;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-gameState.camera.x, -gameState.camera.y);

      // Render Map Background
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

      // Render Map Grid
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      const gridSize = 400;
      for (let x = 0; x <= MAP_WIDTH; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_HEIGHT); ctx.stroke();
      }
      for (let y = 0; y <= MAP_HEIGHT; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_WIDTH, y); ctx.stroke();
      }

      // Render Obstacles
      gameState.obstacles.forEach(obs => {
        if (obs.type === 'mountain') {
          ctx.fillStyle = '#444';
          ctx.beginPath();
          ctx.moveTo(obs.position.x, obs.position.y - obs.height/2);
          ctx.lineTo(obs.position.x + obs.width/2, obs.position.y + obs.height/2);
          ctx.lineTo(obs.position.x - obs.width/2, obs.position.y + obs.height/2);
          ctx.fill();
        } else if (obs.type === 'tree') {
          ctx.fillStyle = '#225522';
          ctx.beginPath(); ctx.arc(obs.position.x, obs.position.y, obs.width/2, 0, Math.PI * 2); ctx.fill();
        } else if (obs.type === 'rock') {
          ctx.fillStyle = '#666';
          ctx.beginPath(); ctx.arc(obs.position.x, obs.position.y, obs.width/2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#332211';
          ctx.fillRect(obs.position.x - obs.width/2, obs.position.y - obs.height/2, obs.width, obs.height);
        }
      });

      // Render Resources
      gameState.resources.forEach(node => {
        if (node.amount <= 0) return;
        ctx.fillStyle = node.type === 'gold' ? '#FFD700' : '#00FFFF';
        ctx.beginPath(); ctx.arc(node.position.x, node.position.y, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`${Math.floor(node.amount)}`, node.position.x, node.position.y + 5);
      });

      // Render Buildings
      gameState.buildings.forEach(building => {
        const faction = gameState.factions[building.factionId];
        const stats = BUILDING_STATS[building.type];
        ctx.fillStyle = faction.color;
        ctx.fillRect(building.position.x - stats.width/2, building.position.y - stats.height/2, stats.width, stats.height);
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(building.position.x - stats.width/2, building.position.y - stats.height/2, stats.width, stats.height);
        
        ctx.fillStyle = '#440000';
        ctx.fillRect(building.position.x - stats.width/2, building.position.y - stats.height/2 - 15, stats.width, 6);
        ctx.fillStyle = building.isConstructing ? '#FFFF00' : '#00FF00';
        const barWidth = building.isConstructing ? (building.progress / 100) * stats.width : (building.hp / building.maxHp) * stats.width;
        ctx.fillRect(building.position.x - stats.width/2, building.position.y - stats.height/2 - 15, barWidth, 6);

        ctx.fillStyle = 'white';
        ctx.font = '14px Arial'; ctx.textAlign = 'center';
        ctx.fillText(BUILDING_NAMES[building.type], building.position.x, building.position.y + 5);

        if (selectedUnitIds.includes(building.id)) {
          ctx.strokeStyle = '#00FF00'; ctx.setLineDash([5, 5]);
          ctx.strokeRect(building.position.x - stats.width/2 - 5, building.position.y - stats.height/2 - 5, stats.width + 10, stats.height + 10);
          ctx.setLineDash([]);
        }
      });

      // Render Units
      gameState.units.forEach(unit => {
        const faction = gameState.factions[unit.factionId];
        ctx.fillStyle = faction.unitColor;
        
        if (unit.type === 'tank' || unit.type === 'heavy_mech') {
          const size = unit.type === 'heavy_mech' ? 30 : 24;
          ctx.fillRect(unit.position.x - size/2, unit.position.y - size/2, size, size);
        } else if (unit.type === 'harvester') {
          ctx.fillRect(unit.position.x - 12, unit.position.y - 12, 24, 24);
          if (unit.cargoAmount && unit.cargoAmount > 0) {
            ctx.fillStyle = unit.cargoType === 'gold' ? '#FFD700' : '#00FFFF';
            ctx.fillRect(unit.position.x - 6, unit.position.y - 6, 12, 12);
          }
        } else {
          const size = unit.type === 'swarmer' ? 8 : 10;
          ctx.beginPath(); ctx.arc(unit.position.x, unit.position.y, size, 0, Math.PI * 2); ctx.fill();
        }

        ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1;
        if (unit.type !== 'tank' && unit.type !== 'harvester' && unit.type !== 'heavy_mech') ctx.stroke();
        else {
          const size = unit.type === 'heavy_mech' ? 30 : 24;
          ctx.strokeRect(unit.position.x - size/2, unit.position.y - size/2, size, size);
        }

        ctx.fillStyle = '#440000';
        ctx.fillRect(unit.position.x - 15, unit.position.y - 25, 30, 4);
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(unit.position.x - 15, unit.position.y - 25, (unit.hp / unit.maxHp) * 30, 4);

        ctx.fillStyle = 'white';
        ctx.font = '10px Arial'; ctx.textAlign = 'center';
        ctx.fillText(UNIT_NAMES[unit.type], unit.position.x, unit.position.y - 30);

        if (selectedUnitIds.includes(unit.id)) {
          ctx.strokeStyle = '#00FF00'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(unit.position.x, unit.position.y, 22, 0, Math.PI * 2); ctx.stroke();
          if (unit.targetPosition) {
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)'; ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.moveTo(unit.position.x, unit.position.y); ctx.lineTo(unit.targetPosition.x, unit.targetPosition.y); ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      });

      // Building Placement Ghost & Radius
      if (placingBuilding) {
        // Draw the building radius circle(s) around all of player's CCs
        gameState.buildings.filter(b => b.factionId === gameState.playerFaction && b.type === 'command_center').forEach(cc => {
            ctx.beginPath();
            ctx.arc(cc.position.x, cc.position.y, BUILD_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 255, 0, 0.05)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        const stats = BUILDING_STATS[placingBuilding];
        const playerCCs = gameState.buildings.filter(b => b.factionId === gameState.playerFaction && b.type === 'command_center' && !b.isConstructing);
        
        let isNearCC = playerCCs.some(cc => {
            const dx = cc.position.x - mouseWorldPos.x;
            const dy = cc.position.y - mouseWorldPos.y;
            return Math.sqrt(dx * dx + dy * dy) <= BUILD_RADIUS;
        });

        // CC can be placed anywhere
        if (placingBuilding === 'command_center') isNearCC = true;

        const color = isNearCC ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
        const borderColor = isNearCC ? '#0F0' : '#F00';

        ctx.fillStyle = color;
        ctx.fillRect(mouseWorldPos.x - stats.width/2, mouseWorldPos.y - stats.height/2, stats.width, stats.height);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(mouseWorldPos.x - stats.width/2, mouseWorldPos.y - stats.height/2, stats.width, stats.height);
        
        if (!isNearCC) {
            ctx.fillStyle = 'red';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('超出建造范围!', mouseWorldPos.x, mouseWorldPos.y - stats.height/2 - 10);
        }
      }

      // Effects
      (gameState.effects || []).forEach(eff => {
        if (eff.type === 'projectile' && eff.targetPosition) {
          const x = eff.startPosition.x + (eff.targetPosition.x - eff.startPosition.x) * eff.progress;
          const y = eff.startPosition.y + (eff.targetPosition.y - eff.startPosition.y) * eff.progress;
          ctx.fillStyle = eff.color;
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        } else if (eff.type === 'muzzle_flash') {
          ctx.fillStyle = eff.color;
          ctx.beginPath(); ctx.arc(eff.startPosition.x, eff.startPosition.y, 20 * (1 - eff.progress), 0, Math.PI * 2); ctx.fill();
        } else if (eff.type === 'explosion') {
          ctx.fillStyle = eff.color;
          ctx.beginPath(); ctx.arc(eff.startPosition.x, eff.startPosition.y, 50 * eff.progress, 0, Math.PI * 2); ctx.fill();
        }
      });

      ctx.restore();

      if (selectionBox) {
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.strokeRect(selectionBox.start.x, selectionBox.start.y, selectionBox.end.x - selectionBox.start.x, selectionBox.end.y - selectionBox.start.y);
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.fillRect(selectionBox.start.x, selectionBox.start.y, selectionBox.end.x - selectionBox.start.x, selectionBox.end.y - selectionBox.start.y);
      }
    };

    render();
  }, [gameState, selectionBox, selectedUnitIds, placingBuilding, mouseWorldPos]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const zoom = gameState.camera.zoom;
    return {
      x: (x - canvas.width / 2) / zoom + gameState.camera.x,
      y: (y - canvas.height / 2) / zoom + gameState.camera.y
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (placingBuilding) {
      if (e.button === 0) onPlaceBuilding(placingBuilding, worldPos);
      return;
    }
    if (e.button === 0) {
      setSelectionBox({ start: { x: e.clientX, y: e.clientY }, end: { x: e.clientX, y: e.clientY } });
    } else if (e.button === 2) {
      const clickedResource = gameState.resources.find(r => Math.hypot(r.position.x - worldPos.x, r.position.y - worldPos.y) < 30);
      const clickedEnemy = gameState.units.find(u => u.factionId !== gameState.playerFaction && Math.hypot(u.position.x - worldPos.x, u.position.y - worldPos.y) < 25);
      const clickedBuilding = gameState.buildings.find(b => b.factionId !== gameState.playerFaction && Math.abs(b.position.x - worldPos.x) < 40 && Math.abs(b.position.y - worldPos.y) < 40);
      onMove(worldPos, clickedResource?.id || clickedEnemy?.id || clickedBuilding?.id);
    } else if (e.button === 1) {
      setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    setMouseWorldPos(worldPos);
    if (selectionBox) setSelectionBox({ ...selectionBox, end: { x: e.clientX, y: e.clientY } });
    if (isDragging && dragStart) {
      const dx = (dragStart.x - e.clientX) / gameState.camera.zoom;
      const dy = (dragStart.y - e.clientY) / gameState.camera.zoom;
      onCameraMove(dx, dy);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    if (selectionBox) {
      const worldStart = screenToWorld(selectionBox.start.x, selectionBox.start.y);
      const worldEnd = screenToWorld(selectionBox.end.x, selectionBox.end.y);
      const minX = Math.min(worldStart.x, worldEnd.x), maxX = Math.max(worldStart.x, worldEnd.x);
      const minY = Math.min(worldStart.y, worldEnd.y), maxY = Math.max(worldStart.y, worldEnd.y);
      const isSingleClick = Math.abs(selectionBox.start.x - selectionBox.end.x) < 5 && Math.abs(selectionBox.start.y - selectionBox.end.y) < 5;
      let newSelectedIds: string[] = [];
      if (isSingleClick) {
        const clickedUnit = gameState.units.find(u => u.factionId === gameState.playerFaction && Math.hypot(u.position.x - worldStart.x, u.position.y - worldStart.y) < 25);
        if (clickedUnit) newSelectedIds = [clickedUnit.id];
        else {
          const clickedBuilding = gameState.buildings.find(b => b.factionId === gameState.playerFaction && Math.abs(b.position.x - worldStart.x) < 50 && Math.abs(b.position.y - worldStart.y) < 50);
          if (clickedBuilding) newSelectedIds = [clickedBuilding.id];
        }
      } else {
        newSelectedIds = [...gameState.units.filter(u => u.factionId === gameState.playerFaction && u.position.x >= minX && u.position.x <= maxX && u.position.y >= minY && u.position.y <= maxY).map(u => u.id),
                         ...gameState.buildings.filter(b => b.factionId === gameState.playerFaction && b.position.x >= minX && b.position.x <= maxX && b.position.y >= minY && b.position.y <= maxY).map(b => b.id)];
      }
      onSelect(newSelectedIds);
      setSelectionBox(null);
    }
    setIsDragging(false); setDragStart(null);
  };


  return <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onContextMenu={e => e.preventDefault()} style={{ display: 'block', backgroundColor: '#111' }} />;
};

export default GameCanvas;
