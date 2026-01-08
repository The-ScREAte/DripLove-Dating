import { ScenarioPack } from './types';

const PACK_COUNT = 6;
const STORAGE_KEY = 'driplove:games:test-your-toast:pack-cycle:v2';

// Seeded shuffle for deterministic randomization
export const seededShuffle = <T,>(array: T[], seed: number): T[] => {
  const arr = [...array];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Get and increment pack index for level
export const getAndBumpPackIndex = (level: number): number => {
  const stored = localStorage.getItem(STORAGE_KEY);
  const data = stored ? JSON.parse(stored) : {};
  const currentIndex = data[`level${level}`] || 0;
  const nextIndex = (currentIndex + 1) % PACK_COUNT;
  data[`level${level}`] = nextIndex;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return currentIndex;
};

// Lazy load scenario pack
export const loadScenarioPack = async (packIndex: number): Promise<ScenarioPack> => {
  const packNumber = (packIndex % PACK_COUNT) + 1;
  const module = await import(`./scenarios/testYourToast.pack${packNumber}.ts`);
  return module[`pack${packNumber}`];
};

// Get scenarios for level with shuffled options
export const getScenariosForLevel = async (level: number): Promise<ScenarioPack> => {
  const packIndex = getAndBumpPackIndex(level);
  const pack = await loadScenarioPack(packIndex);
  
  // Shuffle option order for each scenario
  const shuffledScenarios = pack.scenarios.map(scenario => {
    const seed = scenario.id * 1000 + level * 100 + packIndex;
    const shuffledOptions = seededShuffle(scenario.options, seed);
    
    // Find new correct index after shuffle
    const correctOption = scenario.options[scenario.correctIndex];
    const newCorrectIndex = shuffledOptions.indexOf(correctOption);
    
    return {
      ...scenario,
      options: shuffledOptions,
      correctIndex: newCorrectIndex,
    };
  });
  
  return {
    ...pack,
    scenarios: shuffledScenarios,
  };
};

// Clear pack rotation (useful for testing)
export const clearPackRotation = () => {
  localStorage.removeItem(STORAGE_KEY);
};
