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
  enrichment_status?: DreamEnrichmentStatus;
  interpreted_at?: string;
  image_generated_at?: string;
  interpretation_error?: string | null;
  image_error?: string | null;
  created_at?: string;
  updated_at?: string;
}
