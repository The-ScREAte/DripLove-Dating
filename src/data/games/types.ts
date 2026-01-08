export type AnswerQuality = 'optimal' | 'acceptable' | 'poor';

export interface Scenario {
  id: number;
  personality: string;
  situation: string;
  options: string[];
  correctIndex: number;
  quality?: AnswerQuality; // quality of the correct answer
  feedback: {
    correct: string;
    incorrect: string;
  };
}

export interface ScenarioPack {
  packId: number;
  scenarios: Scenario[];
}
