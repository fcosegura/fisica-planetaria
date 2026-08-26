import { useState } from 'react';
import { useSimulationStore } from '@/store/simulation-store';
import { ALL_SCENARIOS } from '@/sim/scenarios';
import {
  ASTEROIDS_CATALOG,
  COMETS_CATALOG,
  DWARF_PLANETS_CATALOG,
  KBOS_CATALOG,
  MOONS_CATALOG,
  PLANETS_CATALOG,
  SOLAR_SYSTEM_CATALOG,
  SUN_TEMPLATE,
  bodyAroundParent,
  bodyFromSunOrbit,
  createAsteroidBeltSwarm,
  createEverythingKnownSolarSystem,
  createKuiperBeltSwarm,
  makeCustomBodyAtOrbit,
  makeSunBody,
  type CatalogCategory,
  type PlanetTemplate,
} from '@/sim/catalog/solar-system';
import type { CelestialBody } from '@/sim/types';
import {
  formatRealSunDisplayPx,
  REAL_SUN_SLIDER_LOG_MAX,
  REAL_SUN_SLIDER_LOG_MIN,
} from '@/sim/visual/display-radius';

const CATEGORY_LABELS: { key: CatalogCategory | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'Todo', icon: '🌌' },
  { key: 'planet', label: 'Planetas', icon: '🪐' },
  { key: 'moon', label: 'Lunas', icon: '🌑' },
  { key: 'dwarf', label: 'Enanos', icon: '⚪' },
  { key: 'asteroid', label: 'Asteroides', icon: '🪨' },
  { key: 'kbo', label: 'Kuiper', icon: '❄️' },
  { key: 'comet', label: 'Cometas', icon: '☄️' },
];

export function Toolbar() {
  const playing = useSimulationStore((s) => s.playing);
  const setPlaying = useSimulationStore((s) => s.setPlaying);
  const stepForward = useSimulationStore((s) => s.stepForward);
  const loadScenario = useSimulationStore((s) => s.loadScenario);
  const currentScenarioId = useSimulationStore((s) => s.currentScenarioId);
  const fitCamera = useSimulationStore((s) => s.fitCamera);
  const toggleDebug = useSimulationStore((s) => s.toggleDebug);
  const showDebug = useSimulationStore((s) => s.showDebug);
  const bodyScaleMode = useSimulationStore((s) => s.bodyScaleMode);
  const setBodyScaleMode = useSimulationStore((s) => s.setBodyScaleMode);
  const relativeSunDisplayPx = useSimulationStore((s) => s.relativeSunDisplayPx);
  const setRelativeSunDisplayPx = useSimulationStore((s) => s.setRelativeSunDisplayPx);
  const realSunDisplayPx = useSimulationStore((s) => s.realSunDisplayPx);
  const setRealSunDisplayPx = useSimulationStore((s) => s.setRealSunDisplayPx);
  const setCollisionMode = useSimulationStore((s) => s.setCollisionMode);
  const removeBody = useSimulationStore((s) => s.removeBody);
  const selectedId = useSimulationStore((s) => s.selectedId);
  const setSelectedId = useSimulationStore((s) => s.setSelectedId);
  const setEngineKind = useSimulationStore((s) => s.setEngineKind);
  const addBody = useSimulationStore((s) => s.addBody);
  const addBodies = useSimulationStore((s) => s.addBodies);
  const placementMode = useSimulationStore((s) => s.placementMode);
  const placementError = useSimulationStore((s) => s.placementError);
  const setPlacementMode = useSimulationStore((s) => s.setPlacementMode);
  const engine = useSimulationStore((s) => s.engine);
  const snapshot = useSimulationStore((s) => s.snapshot);

  const [selectedCategory, setSelectedCategory] = useState<CatalogCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const existingNames = new Set((snapshot?.bodies ?? []).map((b) => b.name.toLowerCase()));
  const currentBodies = snapshot?.bodies ?? [];

  const handleAddCustom = () => {
    if (!engine) return;
    addBody(makeCustomBodyAtOrbit(engine.getBodies()));
    fitCamera();
  };

  /** Adds all known solar system objects (planets, moons, dwarf planets, asteroids, belts, comets) */
  const handleAddEverything = () => {
    if (!engine) return;
    const allKnown = createEverythingKnownSolarSystem({
      includeMoons: true,
      includeDwarfPlanets: true,
      includeAsteroids: true,
      includeAsteroidSwarm: true,
      includeKBOs: true,
      includeKuiperSwarm: true,
      includeComets: true,
      anchorBodies: engine.getBodies(),
    });

    const currentNames = new Set(engine.getBodies().map((b) => b.name.toLowerCase()));
    const missing = allKnown.filter((b) => !currentNames.has(b.name.toLowerCase()));

    if (missing.length > 0) {
      addBodies(missing);
    }
    fitCamera();
  };

  /** Adds all bodies from a specific category */
  const handleAddCategoryGroup = (category: CatalogCategory) => {
    if (!engine) return;
    const bodies = engine.getBodies();
    const toAdd: CelestialBody[] = [];
    const names = new Set(bodies.map((b) => b.name.toLowerCase()));

    // Make sure Sun exists
    let sun = bodies.find((b) => b.name === SUN_TEMPLATE.name);
    if (!sun) {
      sun = makeSunBody();
      toAdd.push(sun);
      names.add(sun.name.toLowerCase());
    }

    if (category === 'planet') {
      PLANETS_CATALOG.forEach((p, i) => {
        if (!names.has(p.name.toLowerCase())) {
          toAdd.push(bodyFromSunOrbit(p, (i * Math.PI) / 4.5));
        }
      });
    } else if (category === 'moon') {
      // Ensure parent planets exist
      for (const planetTemplate of PLANETS_CATALOG) {
        let planetBody = bodies.find((b) => b.name.toLowerCase() === planetTemplate.name.toLowerCase()) ||
          toAdd.find((b) => b.name.toLowerCase() === planetTemplate.name.toLowerCase());

        const moonsForThis = MOONS_CATALOG.filter((m) => m.parent === planetTemplate.id);
        const neededMoons = moonsForThis.filter((m) => !names.has(m.name.toLowerCase()));

        if (neededMoons.length > 0) {
          if (!planetBody) {
            const pIdx = PLANETS_CATALOG.indexOf(planetTemplate);
            planetBody = bodyFromSunOrbit(planetTemplate, (pIdx * Math.PI) / 4.5);
            toAdd.push(planetBody);
            names.add(planetBody.name.toLowerCase());
          }

          neededMoons.forEach((m, idx) => {
            toAdd.push(bodyAroundParent(m, planetBody!, (idx * Math.PI) / 3));
            names.add(m.name.toLowerCase());
          });
        }
      }
    } else if (category === 'dwarf') {
      DWARF_PLANETS_CATALOG.forEach((d, i) => {
        if (!names.has(d.name.toLowerCase())) {
          toAdd.push(bodyFromSunOrbit(d, ((i + 1) * Math.PI) / 5 + 0.3));
        }
      });
    } else if (category === 'asteroid') {
      ASTEROIDS_CATALOG.forEach((a, i) => {
        if (!names.has(a.name.toLowerCase())) {
          toAdd.push(bodyFromSunOrbit(a, (i * Math.PI) / 4 + 0.6));
        }
      });
      // Add asteroid swarm
      const swarm = createAsteroidBeltSwarm(30).filter((b) => !names.has(b.name.toLowerCase()));
      toAdd.push(...swarm);
    } else if (category === 'kbo') {
      KBOS_CATALOG.forEach((k, i) => {
        if (!names.has(k.name.toLowerCase())) {
          toAdd.push(bodyFromSunOrbit(k, (i * Math.PI) / 2 + 1));
        }
      });
      // Add Kuiper swarm
      const swarm = createKuiperBeltSwarm(20).filter((b) => !names.has(b.name.toLowerCase()));
      toAdd.push(...swarm);
    } else if (category === 'comet') {
      COMETS_CATALOG.forEach((c, i) => {
        if (!names.has(c.name.toLowerCase())) {
          toAdd.push(bodyFromSunOrbit(c, (i * Math.PI) / 2 + 0.5));
        }
      });
    }

    if (toAdd.length > 0) {
      addBodies(toAdd);
      fitCamera();
    }
  };

  /** Handles adding an individual body with smart hierarchical dependency resolution */
  const handleAddBody = (template: PlanetTemplate) => {
    if (!engine) return;
    const bodies = engine.getBodies();
    const presentBody = bodies.find(
      (body) =>
        body.name.toLowerCase() === template.name.toLowerCase() ||
        body.id.startsWith(template.id),
    );
    if (presentBody) {
      removeBody(presentBody.id);
      fitCamera();
      return;
    }

    if (template.parent !== 'sun') {
      // It's a moon/satellite around another body
      const toAdd: CelestialBody[] = [];
      const parentTemplate = SOLAR_SYSTEM_CATALOG.find((p) => p.id === template.parent);
      const parentName = parentTemplate?.name ?? (template.parent === 'earth' ? 'Tierra' : template.parent);

      let parentBody = bodies.find((b) => b.name.toLowerCase() === parentName.toLowerCase());

      if (!parentBody && parentTemplate) {
        // Auto-create parent planet
        const parentIdx = PLANETS_CATALOG.findIndex((p) => p.id === parentTemplate.id);
        parentBody = bodyFromSunOrbit(parentTemplate, (Math.max(0, parentIdx) * Math.PI) / 4.5);
        toAdd.push(parentBody);
      }

      if (parentBody) {
        const moonsForParent = MOONS_CATALOG.filter((m) => m.parent === template.parent);
        const moonIdx = moonsForParent.findIndex((m) => m.id === template.id);
        const moonBody = bodyAroundParent(template, parentBody, (Math.max(0, moonIdx) * Math.PI) / 3);
        toAdd.push(moonBody);
      }

      if (toAdd.length > 0) {
        addBodies(toAdd);
      }
    } else {
      // Heliocentric body (Planet, Dwarf planet, Asteroid, KBO, Comet)
      const index = SOLAR_SYSTEM_CATALOG.findIndex((p) => p.id === template.id);
      addBody(bodyFromSunOrbit(template, (Math.max(0, index) * Math.PI) / 5));
    }
    fitCamera();
  };

  const filteredCatalog = SOLAR_SYSTEM_CATALOG.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="toolbar">
      <h1>N-Body Orbital Laboratory</h1>
      <div className="toolbar-row">
        <button
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pausar simulación' : 'Reanudar simulación'}
        >
          {playing ? '⏸ Pausa' : '▶ Play'}
        </button>
        <button onClick={stepForward} aria-label="Avanzar un paso de simulación">
          ⏭ Paso
        </button>
        <button onClick={fitCamera} aria-label="Centrar vista en los cuerpos">
          ⊙ Centrar
        </button>
        <button
          onClick={() => setPlacementMode(!placementMode)}
          className={placementMode ? 'active' : ''}
          title="Clic en el canvas para colocar un cuerpo con órbita calculada"
          aria-label={placementMode ? 'Cancelar modo colocación' : 'Activar modo colocación de cuerpo'}
        >
          {placementMode ? '✕ Cancelar colocación' : '🎯 Colocar cuerpo'}
        </button>
        <button
          onClick={() => setBodyScaleMode(bodyScaleMode === 'relative' ? 'real' : 'relative')}
          className={bodyScaleMode === 'real' ? 'active' : ''}
          aria-label="Alternar escala de tamaño de cuerpos: relativo o real"
          title={
            bodyScaleMode === 'real'
              ? 'Escala real: tamaños y distancias proporcionales al Sol. Baja el Sol para ver más sistema.'
              : 'Tamaño relativo: todos los cuerpos visibles con mínimo legible. Clic para cambiar a real.'
          }
        >
          {bodyScaleMode === 'real' ? '🪐 Tamaño: Real' : '🔍 Tamaño: Relativo'}
        </button>
        {bodyScaleMode === 'relative' && (
          <label className="sun-scale-control" title="Tamaño visual del Sol; el resto se escala a partir de él">
            <span>Sol {Math.round(relativeSunDisplayPx)}px</span>
            <input
              type="range"
              min={12}
              max={64}
              step={1}
              value={relativeSunDisplayPx}
              onChange={(e) => setRelativeSunDisplayPx(Number(e.target.value))}
              aria-label="Escala visual del Sol"
            />
          </label>
        )}
        {bodyScaleMode === 'real' && (
          <label className="sun-scale-control" title="Escala física del sistema; baja el Sol para ver más órbitas">
            <span>Sol {formatRealSunDisplayPx(realSunDisplayPx)}</span>
            <input
              type="range"
              min={REAL_SUN_SLIDER_LOG_MIN}
              max={REAL_SUN_SLIDER_LOG_MAX}
              step={0.05}
              value={Math.log10(realSunDisplayPx)}
              onChange={(e) => setRealSunDisplayPx(10 ** Number(e.target.value))}
              aria-label="Tamaño del Sol en escala física"
            />
          </label>
        )}
        <button
          onClick={toggleDebug}
          className={showDebug ? 'active' : ''}
          aria-label="Mostrar u ocultar vectores de velocidad debug"
        >
          Debug v
        </button>
        <select
          value={engine?.getConfig().collisionMode ?? 'merge'}
          onChange={(e) => setCollisionMode(e.target.value as 'merge' | 'ignore')}
          aria-label="Modo de colisión"
          title="Merge fusiona los cuerpos y muestra una onda de impacto; ignore permite que se atraviesen"
        >
          <option value="merge">Colisión: fusionar</option>
          <option value="ignore">Colisión: atravesar</option>
        </select>
      </div>

      <div className="toolbar-row engine-select" role="group" aria-label="Motor de simulación">
        <span className="engine-select-label">Motor:</span>
        <button
          type="button"
          className={(snapshot?.engineKind ?? 'nbody') === 'nbody' ? 'active' : ''}
          aria-pressed={(snapshot?.engineKind ?? 'nbody') === 'nbody'}
          onClick={() => setEngineKind('nbody')}
        >
          N-body
        </button>
        <button
          type="button"
          className={snapshot?.engineKind === 'orbital' ? 'active' : ''}
          aria-pressed={snapshot?.engineKind === 'orbital'}
          onClick={() => setEngineKind('orbital')}
        >
          Orbital
        </button>
      </div>

      <div className="toolbar-row scenarios">
        <label>Escenario:</label>
        <select
          value={currentScenarioId}
          onChange={(e) => {
            const s = ALL_SCENARIOS.find((sc) => sc.id === e.target.value);
            if (s) loadScenario(s);
          }}
        >
          {ALL_SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar-row body-selector">
        <label htmlFor="body-selector">Objeto:</label>
        <select
          id="body-selector"
          value={snapshot?.bodies.some((body) => body.id === selectedId) ? selectedId ?? '' : ''}
          onChange={(e) => setSelectedId(e.target.value || null)}
          aria-label="Seleccionar objeto de la simulación"
        >
          <option value="">Seleccionar objeto…</option>
          {currentBodies.map((body) => (
            <option key={body.id} value={body.id}>
              {body.name}
            </option>
          ))}
        </select>
      </div>

      <div className="planet-catalog">
        <div className="planet-catalog-header-row">
          <span className="planet-catalog-header">Catálogo Solar ({currentBodies.length} cuerpos)</span>
        </div>

        {/* Master One-Click Add Button */}
        <button
          className="add-everything-btn"
          onClick={handleAddEverything}
          title="Añadir todos los planetas, lunas, planetas enanos, asteroides, cometas y cinturones conocidos"
        >
          🌟 Añadir TODO lo conocido
        </button>

        {/* Quick-add category buttons */}
        <div className="quick-category-row">
          <button onClick={() => handleAddCategoryGroup('planet')} title="Añadir los 8 planetas principales">
            + Planetas
          </button>
          <button onClick={() => handleAddCategoryGroup('moon')} title="Añadir todas las lunas principales">
            + Lunas
          </button>
          <button onClick={() => handleAddCategoryGroup('dwarf')} title="Añadir planetas enanos">
            + Enanos
          </button>
          <button onClick={() => handleAddCategoryGroup('asteroid')} title="Añadir asteroides y cinturón">
            + Cinturón
          </button>
          <button onClick={() => handleAddCategoryGroup('kbo')} title="Añadir cinturón de Kuiper">
            + Kuiper
          </button>
          <button onClick={() => handleAddCategoryGroup('comet')} title="Añadir cometas y centauros">
            + Cometas
          </button>
        </div>

        {/* Category Tabs */}
        <div className="catalog-tabs">
          {CATEGORY_LABELS.map((cat) => (
            <button
              key={cat.key}
              className={`catalog-tab ${selectedCategory === cat.key ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.key)}
            >
              <span>{cat.icon}</span> {cat.label}
            </button>
          ))}
        </div>

        {/* Search filter */}
        <div className="catalog-search">
          <input
            type="text"
            placeholder="🔍 Filtrar por nombre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>

        {/* Catalog Items Grid */}
        <div className="planet-catalog-grid">
          {filteredCatalog.map((p) => {
            const present = existingNames.has(p.name.toLowerCase());
            const parentName = p.parent !== 'sun'
              ? SOLAR_SYSTEM_CATALOG.find((x) => x.id === p.parent)?.name ?? p.parent
              : null;

            return (
              <button
                key={p.id}
                className={`planet-btn ${present ? 'present' : ''}`}
                aria-pressed={present}
                aria-label={present ? `Quitar ${p.name}` : `Añadir ${p.name}`}
                title={
                  present
                    ? `${p.name} está en la simulación. Clic para quitarlo`
                    : parentName
                      ? `${p.description ?? ''} (Órbita alrededor de ${parentName})`
                      : p.eccentricity && p.eccentricity > 0.02
                        ? `${p.description ?? ''} (a=${(p.orbitRadius / 1.495978707e11).toFixed(2)} AU, e=${p.eccentricity.toFixed(3)})`
                        : `${p.description ?? ''} (Órbita a ${(p.orbitRadius / 1.495978707e11).toFixed(2)} AU)`
                }
                onClick={() => handleAddBody(p)}
                style={{ borderColor: p.color }}
              >
                <span className="dot" style={{ background: p.color }} />
                <span className="planet-btn-text">
                  <span className="planet-name">{p.name}</span>
                  {parentName && <span className="planet-sub">({parentName})</span>}
                </span>
                {present && <span className="planet-action" aria-hidden="true">×</span>}
              </button>
            );
          })}
        </div>

        <button className="add-custom" onClick={handleAddCustom}>
          + Cuerpo en órbita libre personalizada
        </button>

        {placementMode && (
          <p className="hint placement-hint">
            Haz clic en el canvas para colocar un cuerpo. Su velocidad se calcula para una órbita
            circular en el campo gravitatorio del Sol y los demás cuerpos.
          </p>
        )}
        {placementError && <p className="hint placement-error">{placementError}</p>}
        <p className="hint">
          {bodyScaleMode === 'relative'
            ? '🔍 Relativo: todos los cuerpos visibles; el Sol es referencia con mínimo legible.'
            : '🪐 Real: una escala para tamaños y distancias (R/R☉). Baja el Sol para ver más sistema; súbelo para detalle.'}
        </p>
        <p className="hint">
          Canvas: +/− zoom, ⊙ centrar, ○ seguir, ✕ eliminar el cuerpo seleccionado. Seleccionar un cuerpo inicia el seguimiento.
        </p>
      </div>
    </div>
  );
}
