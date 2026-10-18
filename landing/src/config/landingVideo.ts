export type LandingDemoVideo = {
  captions: string;
  poster: string;
  src: string;
  transcript: string;
};

export function getLandingDemoVideo(): LandingDemoVideo | null {
  const video = {
    src: import.meta.env.VITE_LANDING_DEMO_VIDEO_URL?.trim() ?? "",
    poster: import.meta.env.VITE_LANDING_DEMO_VIDEO_POSTER?.trim() ?? "",
    captions: import.meta.env.VITE_LANDING_DEMO_VIDEO_CAPTIONS?.trim() ?? "",
    transcript: import.meta.env.VITE_LANDING_DEMO_VIDEO_TRANSCRIPT?.trim() ?? "",
  };

  return Object.values(video).every(Boolean) ? video : null;
}
