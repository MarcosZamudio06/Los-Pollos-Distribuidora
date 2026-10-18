import { useEffect, useRef } from "react";
import { getLandingDemoVideo } from "../config/landingVideo";
import { SectionHeading } from "./SectionHeading";
import s from "../styles/landing.module.css";

export function ProductDemoVideo() {
  const video = getLandingDemoVideo();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const pauseWhenHidden = () => {
      if (document.hidden) element.pause();
    };

    document.addEventListener("visibilitychange", pauseWhenHidden);

    const observer = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver((entries) => {
          if (entries.some((entry) => !entry.isIntersecting)) element.pause();
        }, { threshold: 0.25 });

    observer?.observe(element);

    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      observer?.disconnect();
      element.pause();
    };
  }, []);

  if (!video) return null;

  return (
    <section
      id="video-demo"
      className={s.demoVideoSection}
      aria-labelledby="demo-video-title"
    >
      <div className={s.container}>
        <SectionHeading
          id="demo-video-title"
          title="Mira el ERP en acción."
          description="Recorre algunas vistas de gestión en una demostración guiada."
        />
        <figure className={s.demoVideoFrame}>
          <video
            ref={videoRef}
            aria-label="Demostración en video del ERP"
            className={s.demoVideo}
            controls
            playsInline
            preload="none"
            poster={video.poster}
            src={video.src}
          >
            <track
              default
              kind="captions"
              label="Español"
              src={video.captions}
              srcLang="es"
            />
            Tu navegador no puede reproducir este video. Consulta la transcripción.
          </video>
          <figcaption className={s.demoVideoCaption}>
            <a href={video.transcript}>Leer la transcripción</a>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
