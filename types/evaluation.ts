export interface EvaluationCategory {
  id: number;
  name: string;
  max_score: number;
  score: number;
  good_points: string[];
  issues: string[];
  advice: string;
}

export interface EvaluationResult {
  client_name: string;
  evaluator_comment: string;
  total_score: number;
  categories: EvaluationCategory[];
  priority_improvements: string[];
}

/** Row stored in Supabase */
export interface EvaluationRecord {
  id: string;
  user_id: string;
  client_name: string;
  file_name: string;
  total_score: number;
  result: EvaluationResult;
  created_at: string;
}
