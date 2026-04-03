import { ToolType } from './types';

export const INSTRUMENTS = [
  "Piano", "Keyboard/Synth", "Guitar (Acoustic)", "Guitar (Electric)", "Guitar (Bass)",
  "Violin", "Viola", "Cello", "Double Bass", "Flute", "Saxophone (Tenor)", "Saxophone (Alto)",
  "Trumpet", "Trombone", "French Horn", "Tuba", "Harp", "Ukulele", "Sitar", "Organ", 
  "Accordion", "Xylophone", "Marimba", "Vibraphone", "Steel Pans", "Drum Machine"
];

export const TESTIMONIALS = [
  {
    name: "Elena Rostova",
    role: "Composer for Film & TV",
    text: "I had a melody stuck in my head for weeks but couldn't play the cello. I hummed it into Audio Alchemist, and it generated a performance so emotive, it made the final cut of the film. I literally got chills.",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
  },
  {
    name: "Marcus Thorne",
    role: "Indie Producer",
    text: "The separation tool didn't just isolate the vocals; it saved a recording I thought was lost forever due to background noise. It felt like uncovering a buried treasure. Pure magic.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
  },
  {
    name: "Sarah Jenkins",
    role: "Podcast Host",
    text: "I'm not a musician, but I wanted a custom intro. I beatboxed a rhythm and sang a bassline. This tool turned my silly noises into a professional funk track. My listeners asked who I hired!",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop"
  }
];

export const TOOLS_INFO = [
  {
    id: 'vocal-instrument',
    title: ToolType.VOCAL_TO_INSTRUMENT,
    description: "Convert vocal melody into any selected instrument.",
    path: "/tool/vocal-instrument",
    icon: "Mic2"
  },
  {
    id: 'audio-separation',
    title: ToolType.AUDIO_SEPARATION,
    description: "Separate lead, instruments, background, and percussion.",
    path: "/tool/audio-separation",
    icon: "Layers"
  },
  {
    id: 'vocal-split',
    title: ToolType.VOCAL_SPLIT,
    description: "Cleanly split vocal and instrumental tracks.",
    path: "/tool/vocal-split",
    icon: "Scissors"
  },
  {
    id: 'harmony-engine',
    title: ToolType.HARMONY_ENGINE,
    description: "Create 4-part harmonies from a single lead vocal.",
    path: "/tool/harmony-engine",
    icon: "Music"
  }
];