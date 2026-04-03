
export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface HistoryItem {
  id: string;
  userId?: string;
  projectName: string;
  date: string;
  toolUsed: string;
  cloudSource: string;
  resultUrl?: string; // Added to persist the output link
}

export interface CloudProvider {
  id: string;
  name: string;
  connected: boolean;
  icon: string;
  config?: Record<string, string>;
}

export enum ToolType {
  VOCAL_TO_INSTRUMENT = 'Vocal → Instrument',
  AUDIO_SEPARATION = 'Audio Separation',
  VOCAL_SPLIT = 'Vocal & Instrument Split',
  HARMONY_ENGINE = 'Harmony Engine',
}

export interface ProcessingResult {
  success: boolean;
  message: string;
  downloadUrl?: string;
  files?: { name: string; url: string }[];
  analysis?: {
    key: string;
    pitch: string;
    bpm: string;
    mood: string;
    octave: number;
  };
}
