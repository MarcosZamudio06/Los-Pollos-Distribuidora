import s from "../styles/landing.module.css";

type Props = { id: string; title: string; description?: string };

export function SectionHeading({ id, title, description }: Props) {
  return (
    <div className={s.sectionHeading}>
      <h2 id={id}>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}
