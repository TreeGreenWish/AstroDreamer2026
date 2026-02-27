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
}

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
  moon_phase?: string;
  day_number?: number;
  created_at?: string;
}
