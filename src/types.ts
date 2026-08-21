export interface UserProfile {
  id?: number;
  name: string;
  dob: string; // YYYY-MM-DD
  tob: string; // HH:mm
  lob_lat: number;
  lob_lng: number;
  lob_name: string;
  life_path?: number;
  chinese_zodiac?: string;
  birth_chart_interpretation?: string;
  sun_sign?: string;
  moon_sign?: string;
  mercury_sign?: string;
  venus_sign?: string;
  mars_sign?: string;
  jupiter_sign?: string;
  saturn_sign?: string;
  uranus_sign?: string;
  neptune_sign?: string;
  pluto_sign?: string;
  rising_sign?: string;
}

export interface NoteEntry {
  content: string;
  timestamp: string; // ISO string
}

export interface DreamSymbolFeature {
  name: string;
  context: string;
  possible_meanings: string[];
  confidence: 'low' | 'medium' | 'high';
}

export interface DreamCharacterFeature {
  name: string;
  role: string;
  relationship_or_association?: string;
}

export interface DreamEmotionFeature {
  emotion: string;
  intensity: 'low' | 'medium' | 'high';
  context: string;
}

export interface DreamAnalysisV1 {
  version: 1;
  summary: string;
  core_interpretation: string;
  themes: string[];
  symbols: DreamSymbolFeature[];
  characters: DreamCharacterFeature[];
  locations: Array<{ name: string; significance: string }>;
  emotions: DreamEmotionFeature[];
  transformations: string[];
  tensions: string[];
  alternative_readings: string[];
  reflection_questions: string[];
  uncertainty_notes: string[];
}

export interface DreamFeaturesV1 {
  version: 1;
  themes: string[];
  symbols: string[];
  characters: string[];
  locations: string[];
  emotions: string[];
  transformations: string[];
  objects: string[];
  actions: string[];
}

export interface AstrologyBodyFact {
  longitude: number;
  sign: string;
  degree_in_sign: number;
  retrograde: boolean;
}

export interface DreamAstrologyV1 {
  version: 1;
  calculated_at?: string;
  source: string;
  bodies: Record<string, AstrologyBodyFact>;
  moon_phase?: string;
  moon_illumination?: number;
  aspects?: Array<{
    planet1: string;
    planet2: string;
    aspect: 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition';
    orb: number;
  }>;
}

export type DreamEnrichmentStatus = 'raw' | 'interpreting' | 'interpreted' | 'image_failed' | 'complete';

export interface Dream {
  id?: number;
  title: string;
  content: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  location_lat: number;
  location_lng: number;
  location_name: string;
  timezone_name?: string;
  interpretation?: string;
  image_url?: string;
  sun_sign?: string;
  moon_sign?: string;
  mercury_sign?: string;
  venus_sign?: string;
  mars_sign?: string;
  jupiter_sign?: string;
  saturn_sign?: string;
  uranus_sign?: string;
  neptune_sign?: string;
  pluto_sign?: string;
  moon_phase?: string;
  day_number?: number;
  planetary_influences?: {
    sun: string;
    moon: string;
    mercury: string;
    venus: string;
    mars: string;
    jupiter: string;
    saturn: string;
    uranus: string;
    neptune: string;
    pluto: string;
  };
  tags?: string[];
  notes?: NoteEntry[];
  analysis_json?: DreamAnalysisV1 | null;
  analysis_version?: number | null;
  astrology_json?: DreamAstrologyV1 | null;
  astrology_version?: number | null;
  feature_json?: DreamFeaturesV1 | null;
  feature_version?: number | null;
  enrichment_status?: DreamEnrichmentStatus;
  interpreted_at?: string;
  image_generated_at?: string;
  interpretation_error?: string | null;
  image_error?: string | null;
  created_at?: string;
  updated_at?: string;
}
